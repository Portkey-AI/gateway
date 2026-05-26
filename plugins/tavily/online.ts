import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, post } from '../utils';

const BASE_URL = 'https://api.tavily.com/search';
const TAVILY_CLIENT_SOURCE = 'portkey-ai';
const MAX_PROMPT_IMAGES = 5;

type TavilySearchDepth = 'advanced' | 'basic' | 'fast' | 'ultra-fast';
type TavilyTopic = 'general' | 'news' | 'finance';
type TavilyTimeRange =
  | 'day'
  | 'week'
  | 'month'
  | 'year'
  | 'd'
  | 'w'
  | 'm'
  | 'y';
type TavilyIncludeAnswer = boolean | 'basic' | 'advanced';
type TavilyIncludeRawContent = boolean | 'markdown' | 'text';

interface TavilyImageObject {
  url: string;
  description?: string;
}

type TavilyImage = string | TavilyImageObject;

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  raw_content?: string | null;
  favicon?: string | null;
  images?: TavilyImage[];
}

interface FormattedSearchResult {
  title: string;
  url: string;
  text: string;
  score?: number;
  raw_content?: string | null;
  favicon?: string | null;
  images?: TavilyImage[];
}

interface TavilySearchResponse {
  query: string;
  answer?: string;
  images: TavilyImage[];
  results: TavilySearchResult[];
  response_time: number | string;
  auto_parameters?: {
    topic: TavilyTopic;
    search_depth: TavilySearchDepth;
  };
  usage?: {
    credits: number;
  };
  request_id?: string;
}

interface TavilySearchRequest {
  query: string;
  max_results?: number;
  search_depth?: TavilySearchDepth;
  chunks_per_source?: number;
  topic?: TavilyTopic;
  time_range?: TavilyTimeRange;
  start_date?: string;
  end_date?: string;
  include_answer?: TavilyIncludeAnswer;
  include_raw_content?: TavilyIncludeRawContent;
  include_images?: boolean;
  include_image_descriptions?: boolean;
  include_favicon?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
  country?: string;
  auto_parameters?: boolean;
  exact_match?: boolean;
  include_usage?: boolean;
  safe_search?: boolean;
}

interface TavilyOnlineParameters extends PluginParameters<{ apiKey: string }> {
  prefix?: string;
  suffix?: string;
  maxResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  timeout?: number;
  searchDepth?: TavilySearchDepth;
  chunksPerSource?: number;
  topic?: TavilyTopic;
  timeRange?: TavilyTimeRange;
  startDate?: string;
  endDate?: string;
  includeAnswer?: TavilyIncludeAnswer;
  includeRawContent?: TavilyIncludeRawContent;
  includeImages?: boolean;
  includeImageDescriptions?: boolean;
  includeFavicon?: boolean;
  country?: string;
  autoParameters?: boolean;
  exactMatch?: boolean;
  includeUsage?: boolean;
  safeSearch?: boolean;
}

const isDefined = <T>(value: T | undefined): value is T =>
  typeof value !== 'undefined';

const normalizeImage = (image: TavilyImage): TavilyImageObject | null => {
  if (typeof image === 'string') {
    const url = image.trim();
    return url ? { url } : null;
  }

  const url = image.url?.trim();
  if (!url) {
    return null;
  }

  const description = image.description?.trim();
  return {
    url,
    description: description || undefined,
  };
};

const selectPromptImages = (
  images: TavilyImage[] = [],
  limit: number = MAX_PROMPT_IMAGES
): TavilyImageObject[] =>
  images
    .map(normalizeImage)
    .filter((image): image is TavilyImageObject => Boolean(image))
    .slice(0, limit);

const performTavilySearch = async (
  query: string,
  parameters: TavilyOnlineParameters
) => {
  if (!query.trim()) {
    return { searchResults: null, data: null };
  }

  const searchBody: TavilySearchRequest = {
    query,
    max_results: parameters.maxResults ?? 5,
  };

  if (isDefined(parameters.autoParameters)) {
    searchBody.auto_parameters = parameters.autoParameters;
  }

  if (parameters.topic) {
    searchBody.topic = parameters.topic;
  } else if (!parameters.autoParameters) {
    searchBody.topic = 'general';
  }

  if (parameters.searchDepth) {
    searchBody.search_depth = parameters.searchDepth;
  } else if (!parameters.autoParameters) {
    searchBody.search_depth = 'basic';
  }

  const effectiveSearchDepth = searchBody.search_depth;
  const effectiveTopic = searchBody.topic;

  if (parameters.includeDomains?.length) {
    searchBody.include_domains = parameters.includeDomains;
  }

  if (parameters.excludeDomains?.length) {
    searchBody.exclude_domains = parameters.excludeDomains;
  }

  if (
    (effectiveSearchDepth === 'advanced' || effectiveSearchDepth === 'fast') &&
    parameters.chunksPerSource
  ) {
    searchBody.chunks_per_source = parameters.chunksPerSource;
  }

  if (parameters.timeRange) {
    searchBody.time_range = parameters.timeRange;
  }

  if (parameters.startDate) {
    searchBody.start_date = parameters.startDate;
  }

  if (parameters.endDate) {
    searchBody.end_date = parameters.endDate;
  }

  if (isDefined(parameters.includeAnswer)) {
    searchBody.include_answer = parameters.includeAnswer;
  }

  if (isDefined(parameters.includeRawContent)) {
    searchBody.include_raw_content = parameters.includeRawContent;
  }

  if (isDefined(parameters.includeImages)) {
    searchBody.include_images = parameters.includeImages;
  }

  if (
    parameters.includeImages &&
    isDefined(parameters.includeImageDescriptions)
  ) {
    searchBody.include_image_descriptions = parameters.includeImageDescriptions;
  }

  if (isDefined(parameters.includeFavicon)) {
    searchBody.include_favicon = parameters.includeFavicon;
  }

  if (isDefined(parameters.exactMatch)) {
    searchBody.exact_match = parameters.exactMatch;
  }

  if (isDefined(parameters.includeUsage)) {
    searchBody.include_usage = parameters.includeUsage;
  }

  if (
    isDefined(parameters.safeSearch) &&
    (effectiveSearchDepth === 'basic' || effectiveSearchDepth === 'advanced')
  ) {
    searchBody.safe_search = parameters.safeSearch;
  }

  if (parameters.country && effectiveTopic === 'general') {
    searchBody.country = parameters.country;
  }

  const options = {
    headers: {
      Authorization: `Bearer ${parameters.credentials?.apiKey}`,
      'Content-Type': 'application/json',
      'X-Client-Source': TAVILY_CLIENT_SOURCE,
    },
  };

  try {
    const result: TavilySearchResponse = await post(
      BASE_URL,
      searchBody,
      options,
      parameters.timeout ?? 30000
    );

    if (!result.results || result.results.length === 0) {
      return { searchResults: null, data: result };
    }

    const formattedResults: FormattedSearchResult[] = result.results.map(
      (item) => ({
        title: item.title,
        url: item.url,
        text: item.content || item.raw_content || '',
        score: item.score,
        raw_content: item.raw_content,
        favicon: item.favicon,
        images: item.images,
      })
    );

    return { searchResults: formattedResults, data: result };
  } catch (error) {
    console.error('Error searching with Tavily:', error);
    return { searchResults: null, data: { error } };
  }
};

const formatImageLine = (image: TavilyImageObject, index: number): string => {
  if (image.description) {
    return `Image ${index + 1}: ${image.url}\nDescription: ${image.description}\n`;
  }

  return `Image ${index + 1}: ${image.url}\n`;
};

const appendImagesSection = (
  formattedText: string,
  heading: string,
  images?: TavilyImage[]
): string => {
  const promptImages = selectPromptImages(images, MAX_PROMPT_IMAGES);

  if (!promptImages.length) {
    return formattedText;
  }

  let nextText = formattedText + `${heading}\n`;

  promptImages.forEach((image, index) => {
    nextText += formatImageLine(image, index);
  });

  return nextText;
};

const formatSearchResultsForPrompt = (
  results: FormattedSearchResult[],
  topLevelImages: TavilyImage[] = [],
  answer?: string,
  prefix: string = '\n<web_search_context>',
  suffix: string = '\n</web_search_context>'
): string => {
  if (!results || results.length === 0) {
    return '';
  }

  let formattedText = prefix + '\n';

  if (answer) {
    formattedText += `Search Answer: ${answer}\n`;
  }

  formattedText = appendImagesSection(
    formattedText,
    'Query-Related Images:',
    topLevelImages
  );

  results.forEach((result, index) => {
    formattedText += `[${index + 1}] "${result.title}"\n`;
    formattedText += `URL: ${result.url}\n`;
    formattedText += `${result.text}\n`;
    formattedText = appendImagesSection(
      formattedText,
      `Result ${index + 1} Images:`,
      result.images
    );
  });

  formattedText += suffix;
  return formattedText;
};

const appendSearchResultsToContent = (content: any, searchResults: string) => {
  if (typeof content === 'string') {
    return content + searchResults;
  }

  if (Array.isArray(content)) {
    return [
      ...content,
      {
        type: 'text',
        text: searchResults,
      },
    ];
  }

  return searchResults;
};

const prependSearchResultsToPrompt = (prompt: any, searchResults: string) => {
  if (typeof prompt === 'string') {
    return searchResults + prompt;
  }

  if (Array.isArray(prompt)) {
    return [searchResults, ...prompt];
  }

  return searchResults;
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
        content: appendSearchResultsToContent(
          messages[systemIndex].content,
          searchResults
        ),
      };
    } else {
      messages.unshift({
        role: 'system',
        content: searchResults,
      });
    }

    updatedJson.messages = messages;
  } else {
    updatedJson.prompt = prependSearchResultsToPrompt(
      updatedJson.prompt,
      searchResults
    );
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
  rawParameters: PluginParameters,
  eventType: HookEventType
) => {
  const parameters = rawParameters as TavilyOnlineParameters;

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
    const result = await performTavilySearch(combinedQuery, parameters);

    const sources =
      result?.searchResults?.map((r) => ({
        title: r.title,
        url: r.url,
        text: r.text,
        score: r.score,
        raw_content: r.raw_content,
        favicon: r.favicon,
        images: r.images,
      })) ?? [];

    data = {
      ...result?.data,
      sources,
    };

    if (result?.searchResults && result?.data) {
      const formattedResults = formatSearchResultsForPrompt(
        result.searchResults,
        result.data.images,
        result.data.answer,
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
