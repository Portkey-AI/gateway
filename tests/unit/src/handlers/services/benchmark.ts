import {
  LogsService,
  LogObjectBuilder,
} from '../../../../../src/handlers/services/logsService.js';
import type { Context } from 'hono';
import type { RequestContext } from '../../../../../src/handlers/services/requestContext.js';

// Helper function to create sample data of different sizes
function createSampleData(size: number) {
  const data: any = {
    nested: {},
    array: [],
  };

  for (let i = 0; i < size; i++) {
    data.nested[`key${i}`] = {
      value: `value${i}`,
      timestamp: new Date(),
      metadata: {
        id: i,
        tags: ['tag1', 'tag2'],
      },
    };
    data.array.push({
      index: i,
      data: Buffer.from(`data${i}`).toString('base64'),
      objects: Array(10)
        .fill(null)
        .map((_, j) => ({ subIndex: j })),
    });
  }

  return data;
}

// Mock Context and RequestContext for testing
const mockContext = {
  get: () => [],
  set: () => {},
} as unknown as Context;

const mockRequestContext = {
  providerOption: {
    someOption: 'value',
  },
  requestURL: 'https://api.example.com',
  endpoint: '/test',
  requestBody: { test: 'body' },
  index: 0,
  cacheConfig: {
    mode: 'default',
    maxAge: 3600,
  },
  transformedRequestBody: { transformed: 'body' },
  params: { param: 'value' },
} as unknown as RequestContext;

function measureOperation(name: string, fn: () => void, indent: number = 0) {
  const start = performance.now();
  fn();
  const duration = performance.now() - start;
  console.log(`${' '.repeat(indent)}${name}: ${duration.toFixed(3)}ms`);
  return duration;
}

// Measure multiple iterations to see JIT optimization
function measureWithIterations(
  name: string,
  fn: () => void,
  iterations: number = 10
) {
  const times: number[] = [];
  console.log(`\n${name} (${iterations} iterations):`);

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log(`  Average: ${avg.toFixed(3)}ms`);
  console.log(`  Min: ${min.toFixed(3)}ms`);
  console.log(`  Max: ${max.toFixed(3)}ms`);
  console.log(`  First: ${times[0].toFixed(3)}ms`);
  console.log(`  Last: ${times[times.length - 1].toFixed(3)}ms`);

  return avg;
}

// Benchmark scenarios
async function runBenchmarks() {
  console.log('Starting log operation analysis...\n');

  const scenarios = [
    { name: 'Small payload', size: 10 },
    { name: 'Medium payload', size: 100 },
    { name: 'Large payload', size: 1000 },
  ];

  for (const scenario of scenarios) {
    console.log(`\nScenario: ${scenario.name}`);
    console.log('='.repeat(20));
    const sampleData = createSampleData(scenario.size);

    // Initialize and setup
    const logsService = new LogsService(mockContext);
    const builder = new LogObjectBuilder(logsService, mockRequestContext);

    // Setup the builder with data
    builder.updateRequestContext(mockRequestContext, {
      'Content-Type': 'application/json',
    });
    builder.addTransformedRequest(sampleData, { 'X-Custom': 'value' });
    builder.addResponse(
      new Response(JSON.stringify(sampleData), {
        headers: { 'Content-Type': 'application/json' },
      }),
      sampleData
    );
    builder.addExecutionTime(new Date());
    builder.addCache('hit', 'test-key');
    builder.addHookSpanId('span-123');

    // Measure individual operations with iterations
    measureWithIterations('Validation check', () => {
      (builder as any).isComplete((builder as any).logData);
    });

    measureWithIterations('Clone operation', () => {
      (builder as any).clone();
    });

    measureWithIterations('Full log operation', () => {
      builder.log();
    });

    // Memory usage
    const memoryUsage = process.memoryUsage();
    console.log('\nMemory usage:');
    console.log(
      `  - Heap used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`
    );
    console.log(
      `  - Heap total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`
    );

    builder.commit();
  }
}

// Run benchmarks
console.log('Running log operation analysis...');
runBenchmarks()
  .then(() => console.log('\nAnalysis completed'))
  .catch(console.error);
