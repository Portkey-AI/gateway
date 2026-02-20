import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildPlugins() {
  const conf = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf-8')
  );
  const pluginsEnabled = conf.plugins_enabled;

  let importStrings: any = [];
  let funcStrings: any = {};
  let funcs: any = {};

  for (const plugin of pluginsEnabled) {
    const manifestPath = path.join(__dirname, plugin, 'manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    const safePluginId = manifest.id.replace(/-/g, '');
    const functions = manifest.functions.map((func: any) => func.id);
    importStrings = [
      ...importStrings,
      ...functions.map(
        (func: any) =>
          `import { handler as ${safePluginId}${func.replace(/-/g, '')} } from "./${plugin}/${func}"`
      ),
    ];

    funcs[plugin] = {};
    functions.forEach((func: any) => {
      funcs[plugin][func] = func;
    });

    funcStrings[plugin] = [];
    for (let key in funcs[plugin]) {
      funcStrings[plugin].push(
        `"${key}": ${safePluginId}${funcs[plugin][key].replace(/-/g, '')}`
      );
    }
  }

  const indexFilePath = './plugins/index.ts';

  let finalFuncStrings: any = [];
  for (let key in funcStrings) {
    finalFuncStrings.push(
      `\n  "${key}": {\n    ${funcStrings[key].join(',\n    ')}\n  }`
    );
  }

  const content = `${importStrings.join('\n')}\n\nexport const plugins = {${finalFuncStrings}\n};\n`;

  fs.writeFileSync(indexFilePath, content);
}

buildPlugins();
