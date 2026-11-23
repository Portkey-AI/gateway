import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, post } from '../utils';

const BASE_URL = 'https://api.specstream.ai/v1/web-search';

interface SpecStreamSource {
  url: string;
  title: string;
  snippet?: string;
  excerpt?: string;
  published?: string;
}

interface SpecStreamSearchData {
  sources?: SpecStreamSource[];
  answer?: {
    value: string;
    page?: string;
  } | null;
  query?: string;
  took_ms?: number;
}

interface SpecStreamSearchResponse {
  data?: SpecStreamSearchData;
  sources?: SpecStreamSource[];
}

const buildQueryWithDomains = (
  query: string,
  includeDomains?: string[],
  excludeDomains?: string[]
): string => {
  const parts: string[] = [query.trim()];

  if (includeDomains && includeDomains.length > 0) {
    const cleaned = includeDomains
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => `site:${d}`);
    if (cleaned.length === 1) {
      parts.push(cleaned[0]);
    } else if (cleaned.length > 1) {
      parts.push(`(${cleaned.join(' OR ')})`);
    }
  }

  if (excludeDomains && excludeDomains.length > 0) {
    for (const domain of excludeDomains) {
      const d = domain.trim();
      if (d) {
        parts.push(`-site:${d}`);
      }
    }
  }

  return parts.join(' ').trim();
};

const performSpecStreamSearch = async (
  query: string,
  credentials: any,
  timeout?: number,
  numResults: number = 5,
  speed: 'default' | 'fast' = 'default',
  passages: boolean = true,
  includeDomains?: string[],
  excludeDomains?: string[]
) => {
  if (!query.trim()) return { searchResults: null, data: null };
  if (!credentials?.apiKey) {
    return {
      searchResults: null,
      data: { error: { message: 'SpecStream API key is required' } },
    };
  }

  const finalQuery = buildQueryWithDomains(
    query,
    includeDomains,
    excludeDomains
  );

  const searchBody: Record<string, any> = {
    q: finalQuery,
    num: numResults,
    speed,
  };

  if (speed === 'default' && passages) {
    searchBody.passages = true;
  }

  const options = {
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  try {
    const result: SpecStreamSearchResponse = await post(
      BASE_URL,
      searchBody,
      options,
      timeout || 10000
    );

    const payload = result?.data ?? result;
    const sources = payload?.sources;

    if (!sources || sources.length === 0) {
      return { searchResults: null, data: null };
    }

    const formattedResults = sources.map((item) => ({
      title: item.title,
      url: item.url,
      text: item.excerpt || item.snippet || '',
      published_date: item.published,
    }));

    return { searchResults: formattedResults, data: payload };
  } catch (error) {
    console.error('Error searching with SpecStream:', error);
    return { searchResults: null, data: { error } };
  }
};

const formatSearchResultsForPrompt = (
  results: any[],
  prefix: string = '\n<web_search_context>',
  suffix: string = '\n</web_search_context>'
): string => {
  if (!results || results.length === 0) return '';

  let formattedText = prefix + '\n';

  results.forEach((result, index) => {
    formattedText += `[${index + 1}] "${result.title}"\n`;
    formattedText += `URL: ${result.url}\n`;
    if (result.published_date) {
      formattedText += `Date: ${result.published_date}\n`;
    }
    formattedText += `${result.text}\n`;
  });

  formattedText += suffix;
  return formattedText;
};

const insertSearchResults = (
  context: PluginContext,
  searchResults: string
): Record<string, any> => {
  const json = context.request.json;
  const updatedJson = { ...json };

  if (context.requestType === 'chatComplete') {
    const messages = [...json.messages];
    const systemIndex = messages.findIndex((msg) => msg.role === 'system');

    if (systemIndex !== -1) {
      messages[systemIndex] = {
        ...messages[systemIndex],
        content: messages[systemIndex].content + searchResults,
      };
    } else {
      messages.unshift({
        role: 'system',
        content: searchResults,
      });
    }

    updatedJson.messages = messages;
  } else {
    updatedJson.prompt = searchResults + updatedJson.prompt;
  }

  return {
    request: {
      json: updatedJson,
    },
    response: {
      json: null,
    },
  };
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;
  const transformedData: Record<string, any> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let transformed = false;

  try {
    if (
      eventType !== 'beforeRequestHook' ||
      (context.requestType !== 'complete' &&
        context.requestType !== 'chatComplete')
    ) {
      return {
        error: null,
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    const { content, textArray } = getCurrentContentPart(context, eventType);

    if (!content) {
      return {
        error: { message: 'request or response json is empty' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    const combinedQuery = textArray.join(' ').trim();
    const speed = parameters.speed === 'fast' ? 'fast' : 'default';
    const passages = parameters.passages !== false;

    const result = await performSpecStreamSearch(
      combinedQuery,
      parameters.credentials,
      parameters.timeout,
      parameters.numResults || 5,
      speed,
      passages,
      parameters.includeDomains,
      parameters.excludeDomains
    );

    data = {
      ...result?.data,
      sources: result?.searchResults?.map((r) => ({
        title: r.title,
        url: r.url,
        text: r.text,
        published_date: r.published_date,
      })),
    };

    if (result?.searchResults) {
      const formattedResults = formatSearchResultsForPrompt(
        result.searchResults,
        parameters.prefix,
        parameters.suffix
      );

      const newTransformedData = insertSearchResults(context, formattedResults);
      Object.assign(transformedData, newTransformedData);
      transformed = true;
    }
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data, transformedData, transformed };
};
