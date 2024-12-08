import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  const languageMap: { [key: string]: string } = {
    sql: 'SQL',
    py: 'Python',
    ts: 'TypeScript',
    js: 'JavaScript',
    java: 'Java',
    cs: 'C#',
    cpp: 'C++',
    c: 'C',
    rb: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    kt: 'Kotlin',
    go: 'Go',
    rs: 'Rust',
    scala: 'Scala',
    r: 'R',
    pl: 'Perl',
    sh: 'Shell',
    html: 'HTML',
    css: 'CSS',
    xml: 'XML',
    json: 'JSON',
    yml: 'YAML',
    md: 'Markdown',
    dockerfile: 'Dockerfile',
    // Add more mappings as needed
  };

  try {
    const format = parameters.format;
    if (!format) {
      throw new Error('Missing required parameter: format');
    }

    let responseText = getText(context, eventType);
    if (!responseText) {
      throw new Error('No text content to analyze');
    }

    const codeBlockRegex = /```(\w+)\n[\s\S]*?\n```/g;
    let matches = Array.from(responseText.matchAll(codeBlockRegex));

    if (matches.length === 0) {
      data = {
        explanation: 'No code blocks found in the text',
        searchedFormat: format,
        foundFormats: [],
        textExcerpt:
          responseText.length > 100
            ? responseText.slice(0, 100) + '...'
            : responseText,
      };
      return { error, verdict, data };
    }

    const foundLanguages = matches.map((match) => {
      const markdownLanguage = match[1].toLowerCase();
      return languageMap[markdownLanguage] || markdownLanguage;
    });

    verdict = foundLanguages.some((lang) => lang === format);

    data = {
      explanation: verdict
        ? `Found code block(s) in ${format} format`
        : `No code blocks in ${format} format found`,
      searchedFormat: format,
      foundFormats: foundLanguages,
      textExcerpt:
        responseText.length > 100
          ? responseText.slice(0, 100) + '...'
          : responseText,
    };
  } catch (e: any) {
    error = e;
    let textExcerpt = getText(context, eventType);
    textExcerpt =
      textExcerpt?.length > 100
        ? textExcerpt.slice(0, 100) + '...'
        : textExcerpt;

    data = {
      explanation: `Error while checking for code blocks: ${e.message}`,
      searchedFormat: parameters.format,
      textExcerpt: textExcerpt || 'No text available',
    };
  }

  return { error, verdict, data };
};
