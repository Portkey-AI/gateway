#!/usr/bin/env node

/**
 * Generates src/services/winky/configs/index.ts from JSON files in that directory
 * 
 * This script reads all JSON files in the configs directory and generates
 * an index.ts file that imports and exports them as a providers object.
 * 
 * Usage: node scripts/generate-configs-index.cjs
 */

const fs = require('fs');
const path = require('path');

const CONFIGS_DIR = 'src/services/winky/configs';
const INDEX_FILE = path.join(CONFIGS_DIR, 'index.ts');

/**
 * Converts filename to camelCase variable name
 * e.g., "azure-openai.json" -> "azureOpenai"
 */
function toCamelCase(filename) {
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
function toProviderKey(filename) {
  return filename.replace('.json', '');
}

/**
 * Validates that a file contains valid JSON
 */
function validateJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function main() {
  const configsDir = path.resolve(CONFIGS_DIR);

  // Check configs directory exists
  if (!fs.existsSync(configsDir)) {
    console.error(`❌ Configs directory not found: ${configsDir}`);
    process.exit(1);
  }

  // Get all JSON files (excluding index.ts)
  const jsonFiles = fs.readdirSync(configsDir)
    .filter(file => file.endsWith('.json'))
    .sort();

  if (jsonFiles.length === 0) {
    console.error('❌ No JSON files found in configs directory');
    process.exit(1);
  }

  console.log(`📋 Found ${jsonFiles.length} pricing files\n`);

  // Validate all files first
  const validFiles = [];
  let hasErrors = false;

  for (const file of jsonFiles) {
    const filePath = path.join(configsDir, file);
    const result = validateJson(filePath);
    
    if (result.valid) {
      console.log(`  ✅ ${file}`);
      validFiles.push(file);
    } else {
      console.log(`  ❌ ${file}: ${result.error}`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('\n❌ Some files failed validation');
    process.exit(1);
  }

  // Generate imports
  const imports = validFiles.map(file => {
    const varName = toCamelCase(file);
    return `import ${varName} from './${file}';`;
  });

  // Generate provider entries
  const providerEntries = validFiles.map(file => {
    const varName = toCamelCase(file);
    const key = toProviderKey(file);
    
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

  // Write the file
  fs.writeFileSync(path.resolve(INDEX_FILE), content, 'utf8');
  
  console.log(`\n✅ Generated ${INDEX_FILE} with ${validFiles.length} providers`);
}

main();

