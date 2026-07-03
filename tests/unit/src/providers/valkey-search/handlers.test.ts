import { Context } from 'hono';

// Mock @valkey/valkey-glide before importing handlers
const mockGlideClient = {
  hset: jest.fn().mockResolvedValue(1),
  del: jest.fn().mockResolvedValue(1),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockGlideFt = {
  create: jest.fn().mockResolvedValue('OK'),
  dropindex: jest.fn().mockResolvedValue('OK'),
  info: jest.fn(),
  search: jest.fn().mockResolvedValue([1, []]),
};

jest.mock('@valkey/valkey-glide', () => ({
  GlideClient: {
    createClient: jest.fn().mockResolvedValue(mockGlideClient),
  },
  GlideFt: mockGlideFt,
  Decoder: { Bytes: 'Bytes' },
  Field: {},
}));

jest.mock('../../../../../src/shared/services/valkey/client', () => ({
  createValkeyClient: jest.fn().mockResolvedValue(mockGlideClient),
  parseValkeyConnectionString: jest.fn().mockReturnValue({
    addresses: [{ host: '127.0.0.1', port: 6379 }],
    options: {},
  }),
}));

import {
  createIndexHandler,
  dropIndexHandler,
  getIndexHandler,
  upsertDocsHandler,
  searchIndexHandler,
  deleteDocsHandler,
} from '../../../../../src/providers/valkey-search/handlers';

function makeCtx(overrides: any = {}) {
  return {
    c: { req: { method: 'POST' } } as unknown as Context,
    providerOptions: { customHost: 'valkey://127.0.0.1:6379' },
    requestURL: overrides.requestURL || 'http://localhost:8787/v1/indexes',
    requestHeaders: {},
    requestBody: overrides.requestBody || {},
    ...overrides,
  };
}

async function parseRes(res: Response) {
  return { status: res.status, body: JSON.parse(await res.text()) };
}

describe('valkey-search handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: index not found (for create to succeed)
    mockGlideFt.info.mockRejectedValue(new Error('Unknown index name'));
  });

  describe('createIndexHandler', () => {
    it('should create an index and return 201', async () => {
      const res = await createIndexHandler(
        makeCtx({
          requestBody: {
            name: 'test_idx',
            schema: {
              vector: {
                type: 'VECTOR',
                algorithm: 'HNSW',
                dims: 3,
                distance: 'COSINE',
              },
              content: { type: 'TEXT' },
            },
          },
        })
      );
      const { status, body } = await parseRes(res);
      expect(status).toBe(201);
      expect(body.status).toBe('created');
      expect(mockGlideFt.create).toHaveBeenCalled();
    });

    it('should return 409 if index already exists', async () => {
      mockGlideFt.info.mockResolvedValue({ index_name: 'test_idx' });
      const res = await createIndexHandler(
        makeCtx({
          requestBody: {
            name: 'test_idx',
            schema: { v: { type: 'TEXT' } },
          },
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(409);
    });

    it('should return 400 for invalid index name', async () => {
      const res = await createIndexHandler(
        makeCtx({
          requestBody: { name: 'bad name!', schema: { v: { type: 'TEXT' } } },
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(400);
    });

    it('should return 400 if name is missing', async () => {
      const res = await createIndexHandler(
        makeCtx({
          requestBody: { schema: { v: { type: 'TEXT' } } },
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(400);
    });

    it('should return 400 if customHost is missing', async () => {
      const res = await createIndexHandler(
        makeCtx({
          providerOptions: {},
          requestBody: { name: 'idx', schema: { v: { type: 'TEXT' } } },
        })
      );
      const { status, body } = await parseRes(res);
      expect(status).toBe(400);
      expect(body.error.message).toContain('customHost');
    });
  });

  describe('searchIndexHandler', () => {
    beforeEach(() => {
      mockGlideFt.info.mockResolvedValue({ index_name: 'test_idx' });
    });

    it('should execute KNN search', async () => {
      const res = await searchIndexHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx/search',
          requestBody: { vector: [1.0, 0.0, 0.0], top_k: 3 },
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(200);
      expect(mockGlideFt.search).toHaveBeenCalled();
    });

    it('should reject filter containing => (injection guard)', async () => {
      const res = await searchIndexHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx/search',
          requestBody: {
            vector: [1.0],
            top_k: 3,
            filter: '@tag:{x}=>[KNN 100 @v $B]',
          },
        })
      );
      const { status, body } = await parseRes(res);
      expect(status).toBe(400);
      expect(body.error.message).toContain('=>');
    });

    it('should return 400 for empty vector', async () => {
      const res = await searchIndexHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx/search',
          requestBody: { vector: [], top_k: 3 },
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(400);
    });

    it('should return 404 if index does not exist', async () => {
      mockGlideFt.info.mockRejectedValue(new Error('Unknown index name'));
      const res = await searchIndexHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/missing/search',
          requestBody: { vector: [1.0], top_k: 3 },
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(404);
    });
  });

  describe('upsertDocsHandler', () => {
    it('should upsert documents', async () => {
      const res = await upsertDocsHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx/upsert',
          requestBody: {
            documents: [
              {
                id: 'doc1',
                fields: { content: 'hello' },
                vector: [1.0, 0.0, 0.0],
              },
            ],
          },
        })
      );
      const { status, body } = await parseRes(res);
      expect(status).toBe(200);
      expect(body.data[0].status).toBe('upserted');
      expect(mockGlideClient.hset).toHaveBeenCalled();
    });

    it('should reject invalid document IDs', async () => {
      const res = await upsertDocsHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx/upsert',
          requestBody: {
            documents: [{ id: 'bad id!@#', fields: {} }],
          },
        })
      );
      const { body } = await parseRes(res);
      expect(body.data[0].status).toBe('error');
    });

    it('should return 400 for empty documents array', async () => {
      const res = await upsertDocsHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx/upsert',
          requestBody: { documents: [] },
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(400);
    });
  });

  describe('dropIndexHandler', () => {
    it('should drop an existing index', async () => {
      mockGlideFt.info.mockResolvedValue({ index_name: 'test_idx' });
      const res = await dropIndexHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx',
        })
      );
      const { status, body } = await parseRes(res);
      expect(status).toBe(200);
      expect(body.deleted).toBe(true);
    });

    it('should return 404 if index does not exist', async () => {
      mockGlideFt.info.mockRejectedValue(new Error('Unknown index name'));
      const res = await dropIndexHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/missing',
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(404);
    });
  });

  describe('getIndexHandler', () => {
    it('should return index info', async () => {
      mockGlideFt.info.mockResolvedValue({
        index_name: 'test_idx',
        num_docs: 5,
      });
      const res = await getIndexHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx',
        })
      );
      const { status, body } = await parseRes(res);
      expect(status).toBe(200);
      expect(body.name).toBe('test_idx');
    });

    it('should return 404 for missing index', async () => {
      mockGlideFt.info.mockRejectedValue(new Error('Unknown index name'));
      const res = await getIndexHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/nope',
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(404);
    });
  });

  describe('deleteDocsHandler', () => {
    it('should delete documents by ID', async () => {
      const res = await deleteDocsHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx/documents',
          requestBody: { ids: ['doc1', 'doc2'] },
        })
      );
      const { status, body } = await parseRes(res);
      expect(status).toBe(200);
      expect(body.deleted).toBe(1);
    });

    it('should return 400 for empty ids array', async () => {
      const res = await deleteDocsHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx/documents',
          requestBody: { ids: [] },
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(400);
    });

    it('should return 400 for invalid document ID', async () => {
      const res = await deleteDocsHandler(
        makeCtx({
          requestURL: 'http://localhost:8787/v1/indexes/test_idx/documents',
          requestBody: { ids: ['valid', 'bad id!'] },
        })
      );
      const { status } = await parseRes(res);
      expect(status).toBe(400);
    });
  });
});
