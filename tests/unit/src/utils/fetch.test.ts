import { Agent } from 'undici';
import { getCustomHttpsAgent } from '../../../../src/utils/fetch';

const mockCa =
  '-----BEGIN CERTIFICATE-----\nMOCK_CA_CERT\n-----END CERTIFICATE-----';

function getSymbolValue<T extends object>(
  obj: T,
  description: string
): unknown {
  const symbol = Object.getOwnPropertySymbols(obj).find(
    (s) => s.description === description
  );
  return symbol ? (obj as any)[symbol] : undefined;
}

describe('getCustomHttpsAgent', () => {
  describe('default behavior', () => {
    it('should create an Agent with rejectUnauthorized true by default', () => {
      const agent = getCustomHttpsAgent();
      const optionsValue = getSymbolValue(agent, 'options');

      expect(agent).toBeInstanceOf(Agent);
      expect(optionsValue).toEqual({
        connect: { rejectUnauthorized: true },
      });
    });
  });

  describe('with custom options', () => {
    it('should create an Agent with custom rejectUnauthorized option', () => {
      const agent = getCustomHttpsAgent({ rejectUnauthorized: false });
      const optionsValue = getSymbolValue(agent, 'options');

      expect(agent).toBeInstanceOf(Agent);
      expect(optionsValue).toEqual({
        connect: { rejectUnauthorized: false },
      });
    });

    it('should create an Agent with custom CA certificate', () => {
      const agent = getCustomHttpsAgent({ ca: mockCa });
      const optionsValue = getSymbolValue(agent, 'options');

      expect(agent).toBeInstanceOf(Agent);
      expect(optionsValue).toEqual({
        connect: { ca: mockCa, rejectUnauthorized: true },
      });
    });
  });

  describe('with Buffer inputs', () => {
    it('should create an Agent with Buffer CA certificate', () => {
      const mockCaBuffer = Buffer.from(mockCa);
      const agent = getCustomHttpsAgent({ ca: mockCaBuffer });
      const optionsValue = getSymbolValue(agent, 'options');

      expect(agent).toBeInstanceOf(Agent);
      expect(optionsValue).toEqual({
        connect: { ca: mockCaBuffer, rejectUnauthorized: true },
      });
    });
  });

  describe('edge cases', () => {
    it('should accept optional options parameter', () => {
      // Test that the function can be called without parameters
      const agent1 = getCustomHttpsAgent();
      expect(agent1).toBeInstanceOf(Agent);

      // Test that the function can be called with empty options
      const agent2 = getCustomHttpsAgent({});
      expect(agent2).toBeInstanceOf(Agent);

      // Test that the function can be called with partial options
      const agent3 = getCustomHttpsAgent({ rejectUnauthorized: false });
      expect(agent3).toBeInstanceOf(Agent);

      // Test that the function can be called with null options
      const agent4 = getCustomHttpsAgent(null as any);
      expect(agent4).toBeInstanceOf(Agent);
    });
  });
});
