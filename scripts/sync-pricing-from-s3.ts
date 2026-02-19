import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * S3_PRICING_BUCKET should be a full URL to the S3 bucket (e.g., "https://bucket-name.s3.amazonaws.com")
 * or a CloudFront/custom domain URL. The script appends "/pricing" to construct the full path.
 */
const PRICING_CONFIG_S3_BASE_URL = `${process.env.S3_PRICING_BUCKET}/pricing`;

/**
 * All known providers from the Providers object.
 * S3 is the source of truth - we'll try to fetch all known providers and only keep what exists there.
 * This list is extracted from src/providers/index.ts
 */
const ALL_KNOWN_PROVIDERS = [
  'openai',
  'cohere',
  'anthropic',
  'azure-openai',
  'huggingface',
  'anyscale',
  'palm',
  'together-ai',
  'google',
  'vertex-ai',
  'perplexity-ai',
  'mistral-ai',
  'deepinfra',
  'ncompass',
  'stability-ai',
  'nomic',
  'ollama',
  'ai21',
  'bedrock',
  'groq',
  'segmind',
  'jina',
  'fireworks-ai',
  'workers-ai',
  'reka-ai',
  'moonshot',
  'openrouter',
  'lingyi',
  'zhipu',
  'novita-ai',
  'monsterapi',
  'deepseek',
  'predibase',
  'triton',
  'voyage',
  'azure-ai',
  'github',
  'deepbricks',
  'siliconflow',
  'cerebras',
  'inference-net',
  'sambanova',
  'lemonfox-ai',
  'upstage',
  'dashscope',
  'x-ai',
  'qdrant',
  'sagemaker',
  'nebius',
  'recraft-ai',
  'milvus',
  'replicate',
  'lepton',
  'kluster-ai',
  'nscale',
  'hyperbolic',
  'bytez',
  'featherless-ai',
  'krutrim',
  '302ai',
  'cometapi',
  'matterai',
  'meshy',
  'nextbit',
  'tripo3d',
  'portkey',
  'modal',
  'z-ai',
  'oracle',
  'iointelligence',
  'aibadgr',
  'ovhcloud',
];

const CONFIGS_DIR = path.join(
  process.cwd(),
  'src',
  'services',
  'winky',
  'configs'
);
const INDEX_FILE = path.join(CONFIGS_DIR, 'index.ts');

/**
 * Converts filename to camelCase variable name
 * e.g., "azure-openai.json" -> "azureOpenai"
 */
function toCamelCase(filename: string): string {
  const name = filename.replace('.json', '');
  return name
    .split('-')
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join('');
}

/**
 * Gets the provider key for the exports object
 * e.g., "azure-openai.json" -> "azure-openai"
 */
function toProviderKey(filename: string): string {
  return filename.replace('.json', '');
}

async function fetchConfig(
  provider: string
): Promise<{ content: string; parsed: any } | null> {
  try {
    const response = await fetch(
      `${PRICING_CONFIG_S3_BASE_URL}/${provider}.json`
    );
    if (!response.ok) {
      // 404 = doesn't exist, 403 = access denied (also means doesn't exist for us)
      if (response.status === 404 || response.status === 403) {
        return null; // File doesn't exist or not accessible, skip it
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    // Fetch as text first to preserve exact formatting (including number precision)
    const content = await response.text();
    // Parse to validate it's valid JSON, but we'll save the original text
    const parsed = JSON.parse(content);
    return { content, parsed };
  } catch (error) {
    // Silently skip errors - S3 is source of truth, if we can't fetch it, it doesn't exist for us
    return null;
  }
}

async function saveConfig(provider: string, content: string): Promise<void> {
  const filePath = path.join(CONFIGS_DIR, `${provider}.json`);
  // Save the original content from S3 to preserve exact formatting
  await fs.writeFile(filePath, content, 'utf8');
  console.log(`✅ Synced ${provider}.json`);
}

async function generateIndexFile(syncedProviders: string[]): Promise<void> {
  // Sort providers for consistent output
  const sortedProviders = syncedProviders.sort();

  // Generate imports
  const imports = sortedProviders.map(
    (provider) =>
      `import ${toCamelCase(`${provider}.json`)} from './${provider}.json';`
  );

  // Generate provider entries
  const providerEntries = sortedProviders.map((provider) => {
    const varName = toCamelCase(`${provider}.json`);
    const key = provider;

    // Use quoted key if it contains hyphens, otherwise use shorthand
    if (key.includes('-')) {
      return `  '${key}': ${varName},`;
    } else {
      return `  ${varName},`;
    }
  });

  // Generate the index.ts content
  const content = `${imports.join('\n')}

const providers: Record<string, any> = {
${providerEntries.join('\n')}
};

export { providers };
`;

  await fs.writeFile(INDEX_FILE, content, 'utf8');
  console.log(`✅ Generated ${INDEX_FILE}`);
}

/**
 * Cleanup files that don't exist in S3 (source of truth).
 * Deletes any local files that we tried to fetch but got 404.
 */
async function cleanupOldFiles(
  syncedProviders: Set<string>,
  attemptedProviders: Set<string>
): Promise<void> {
  try {
    const files = await fs.readdir(CONFIGS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const provider = file.replace('.json', '');
      // Delete if we tried to fetch it but it doesn't exist in S3 (404)
      // S3 is the source of truth - if it's not there, we shouldn't have it locally
      if (attemptedProviders.has(provider) && !syncedProviders.has(provider)) {
        const filePath = path.join(CONFIGS_DIR, file);
        await fs.unlink(filePath);
        console.log(`🗑️  Removed ${file} (no longer in S3)`);
      }
    }
  } catch (error) {
    // Directory might not exist yet, that's okay
  }
}

async function main() {
  if (!process.env.S3_PRICING_BUCKET) {
    console.error(
      '❌ Error: S3_PRICING_BUCKET environment variable is required'
    );
    process.exit(1);
  }

  // Ensure configs directory exists
  await fs.mkdir(CONFIGS_DIR, { recursive: true });

  console.log('════════════════════════════════════════════════════════════');
  console.log('  SYNCING PRICING CONFIGS FROM S3');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Source: ${PRICING_CONFIG_S3_BASE_URL}/`);
  console.log(`  Target: ${CONFIGS_DIR}/`);
  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  // S3 is the source of truth - try to fetch all known providers
  // Only keep files that exist in S3 (successful fetches)
  console.log(
    `📋 Attempting to sync ${ALL_KNOWN_PROVIDERS.length} known providers from S3\n`
  );

  const syncedProviders: string[] = [];
  const skippedProviders: string[] = [];
  const attemptedProviders = new Set<string>();
  let successCount = 0;
  let skippedCount = 0;

  // Try to fetch all known providers from S3
  // S3 is the source of truth - only keep what exists there
  for (const provider of ALL_KNOWN_PROVIDERS) {
    attemptedProviders.add(provider);
    const result = await fetchConfig(provider);
    if (result) {
      // Save the original content to preserve exact formatting from S3
      await saveConfig(provider, result.content);
      syncedProviders.push(provider);
      successCount++;
    } else {
      skippedProviders.push(provider);
      skippedCount++;
    }
  }

  // Cleanup old files that we tried to fetch but got 404 (no longer exist in S3)
  await cleanupOldFiles(new Set(syncedProviders), attemptedProviders);

  // Generate index.ts
  if (syncedProviders.length > 0) {
    await generateIndexFile(syncedProviders);
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`✅ Synced ${successCount} pricing files`);
  if (skippedCount > 0) {
    console.log(`⏭️  Skipped ${skippedCount} files (not found in S3):`);
    // Show skipped providers in a compact format
    const skippedList = skippedProviders.join(', ');
    console.log(`   ${skippedList}`);
  }
  console.log('════════════════════════════════════════════════════════════');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
