import { ClickHouseClient, createClient } from '@clickhouse/client';
import { Environment } from '../../utils/env';

let clickhouseClient: ClickHouseClient | null = null;
async function initClickhouse() {
  // Default to control_plane if ANALYTICS_STORE is not set
  // Only initialize ClickHouse if explicitly set to 'clickhouse'
  const analyticsStore = Environment({}).ANALYTICS_STORE || 'control_plane';
  if (analyticsStore !== 'clickhouse') {
    return;
  }
  let updatedHost = Environment({}).ANALYTICS_STORE_ENDPOINT;
  //modify host to prefix http:// if not present
  if (!updatedHost?.startsWith('http')) {
    updatedHost = `http://${updatedHost}`;
  }
  // modify host to suffix :port is not present
  if (
    !Environment({}).ANALYTICS_STORE_ENDPOINT?.includes(':') &&
    Environment({}).ANALYTICS_STORE_PORT
  ) {
    updatedHost = `${updatedHost}:${Environment({}).ANALYTICS_STORE_PORT}`;
  }

  clickhouseClient = createClient({
    host: updatedHost,
    username: Environment({}).ANALYTICS_STORE_USER,
    password: Environment({}).ANALYTICS_STORE_PASSWORD,
  });
  await testConnection();
}

async function testConnection() {
  if (!clickhouseClient) throw new Error('ClickHouse client not initialized');
  try {
    console.log('Attempting to ping ClickHouse...');
    await clickhouseClient.ping();
    console.log('Ping successful');

    console.log('Attempting to execute a query...');
    const rows = await clickhouseClient.query({
      query: 'SELECT 1',
      format: 'JSONEachRow',
    });
    await rows.json();

    console.log('Connected successfully to ClickHouse');
  } catch (e) {
    console.error('ClickHouse connection error:', e);
    process.exit(1);
  }
}

export { initClickhouse };

export function getClickhouseClient(): ClickHouseClient | null {
  return clickhouseClient;
}

export default clickhouseClient;
