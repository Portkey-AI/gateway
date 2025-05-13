import { handler as panwPrismaAirsHandler } from './intercept';

describe('PANW Prisma AIRS Guardrail', () => {
  const mockContext = {
    request: { text: 'This is a test prompt.' },
    response: { text: 'This is a test response.' },
  };

  const params = {
    credentials: { AIRS_API_KEY: 'dummy-key' },
    profile_name: 'test-profile',
    ai_model: 'gpt-unit-test',
    app_user: 'unit-tester',
    timeout: 3000,
  };

  it('should return a result object with verdict, data, and error', async () => {
    const result = await panwPrismaAirsHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
  });
});
