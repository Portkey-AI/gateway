import { version as gatewayVersion } from '../../package.json';
import {
  buildAktoHostCollectionPayload,
  hostName,
  runAktoGatewayHeartbeatOnStartup,
  runAktoHostCollectionRegistrationOnStartup,
} from './helpers';

describe('aktoApi (heartbeat)', () => {
  const tokenKeyApi = 'PORTKEY_AKTO_API_KEY';

  const prev: Record<string, string | undefined> = {};

  function save(key: string) {
    prev[key] = process.env[key];
  }

  function restoreAll() {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  let fetchSpy: jest.SpyInstance;

  beforeAll(() => {
    [tokenKeyApi].forEach(save);
  });

  afterAll(() => {
    restoreAll();
  });

  beforeEach(() => {
    delete process.env[tokenKeyApi];
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('runAktoGatewayHeartbeatOnStartup', () => {
    it('no-ops without token', async () => {
      await runAktoGatewayHeartbeatOnStartup();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('POSTs moduleInfo like extension sendHeartbeat', async () => {
      process.env[tokenKeyApi] = 'test-jwt';

      await runAktoGatewayHeartbeatOnStartup();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(
        'https://ultron.akto.io/api/updateModuleInfoForHeartbeat'
      );
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
        authorization: 'test-jwt',
      });
      const body = JSON.parse(init.body as string);
      expect(body.moduleInfo).toMatchObject({
        id: expect.stringMatching(/^[0-9a-f]{32}$/),
        moduleType: 'MCP_ENDPOINT_SHIELD',
        currentVersion: gatewayVersion,
      });
      expect(body.moduleInfo.name).toMatch(/^[0-9a-f]{32}$/);
      expect(body.moduleInfo.startedTs).toEqual(
        body.moduleInfo.lastHeartbeatReceived
      );
      expect(body.moduleInfo.additionalData.username).toMatch(/^[0-9a-f]{32}$/);
      expect(body.moduleInfo.additionalData.mcpServers).toEqual({});
    });
  });

  describe('buildAktoHostCollectionPayload', () => {
    it('builds payload with current static tags', () => {
      const payload = buildAktoHostCollectionPayload(hostName);
      expect(payload.host).toBe(hostName);
      expect(payload.colId).toBeGreaterThan(0);
      expect(payload.tagsList).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyName: 'gen-ai',
            value: 'Gen AI',
            source: 'USER',
          }),
          expect.objectContaining({
            keyName: 'source',
            value: 'PORTKEY',
            source: 'USER',
          }),
          expect.objectContaining({
            keyName: 'mcp-server',
            value: 'MCP Server',
            source: 'USER',
          }),
          expect.objectContaining({
            keyName: 'mcp-client',
            value: 'portkey-ai-gateway',
            source: 'USER',
          }),
        ])
      );
    });
  });

  describe('runAktoHostCollectionRegistrationOnStartup', () => {
    it('no-ops without token', async () => {
      await runAktoHostCollectionRegistrationOnStartup();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('POSTs collection registration payload', async () => {
      process.env[tokenKeyApi] = 'test-jwt';

      await runAktoHostCollectionRegistrationOnStartup();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(
        'https://ultron.akto.io/api/createCollectionForHostAndVpc'
      );
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
        authorization: 'test-jwt',
      });
      const body = JSON.parse(init.body as string);
      expect(body.host).toBe(hostName);
      expect(body.colId).toBeGreaterThan(0);
      expect(body.tagsList).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyName: 'gen-ai',
            value: 'Gen AI',
            source: 'USER',
          }),
          expect.objectContaining({
            keyName: 'source',
            value: 'PORTKEY',
            source: 'USER',
          }),
          expect.objectContaining({
            keyName: 'mcp-server',
            value: 'MCP Server',
            source: 'USER',
          }),
          expect.objectContaining({
            keyName: 'mcp-client',
            value: 'portkey-ai-gateway',
            source: 'USER',
          }),
        ])
      );
    });
  });
});
