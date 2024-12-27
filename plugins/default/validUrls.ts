import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import dns from 'dns';
import { getText } from '../utils';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  try {
    let content = getText(context, eventType);
    const not = parameters.not || false;

    if (!content) {
      throw new Error('Missing text to analyze');
    }

    // Find all URLs in the content, they may or may not start with http(s)
    const urls = content.match(/https?:\/\/[^\s]*/g) || [];
    const onlyDNS = parameters.onlyDNS || false;

    if (urls.length === 0) {
      data = {
        explanation: 'No URLs found in the text.',
        urls: [],
        validationMethod: onlyDNS ? 'DNS lookup' : 'HTTP request',
        not,
        textExcerpt:
          content.length > 100 ? content.slice(0, 100) + '...' : content,
      };
      return { error, verdict: false, data };
    }

    let validationResults: { url: string; isValid: boolean }[] = [];

    if (onlyDNS) {
      const results = await Promise.all(
        urls.map(async (url) => ({
          url,
          isValid: await checkDNS(url),
        }))
      );
      validationResults = results;
      const allValid = results.every((result) => result.isValid);
      verdict = not ? !allValid : allValid;
    } else {
      const results = await Promise.all(
        urls.map(async (url) => ({
          url,
          isValid: await checkUrl(url),
        }))
      );
      validationResults = results;
      const allValid = results.every((result) => result.isValid);
      verdict = not ? !allValid : allValid;
    }

    const invalidUrls = validationResults
      .filter((result) => !result.isValid)
      .map((result) => result.url);
    const validUrls = validationResults
      .filter((result) => result.isValid)
      .map((result) => result.url);

    data = {
      verdict,
      not,
      explanation: verdict
        ? not
          ? `All URLs are invalid as expected (${invalidUrls.length} of ${urls.length}).`
          : `All URLs are valid (${validUrls.length} found).`
        : not
          ? `Some URLs are valid when they should all be invalid (${validUrls.length} of ${urls.length}).`
          : `Some URLs are invalid (${invalidUrls.length} of ${urls.length} failed).`,
      validUrls,
      invalidUrls,
      validationMethod: onlyDNS ? 'DNS lookup' : 'HTTP request',
      textExcerpt:
        content.length > 100 ? content.slice(0, 100) + '...' : content,
    };
  } catch (e: any) {
    error = e;
    const content = getText(context, eventType);
    data = {
      explanation: `An error occurred while validating URLs: ${e.message}`,
      validationMethod: parameters.onlyDNS ? 'DNS lookup' : 'HTTP request',
      not: parameters.not || false,
      textExcerpt: content
        ? content.length > 100
          ? content.slice(0, 100) + '...'
          : content
        : 'No text available',
    };
  }

  return { error, verdict, data };
};

async function checkUrl(target: string): Promise<boolean> {
  const controller = new AbortController();
  const { signal } = controller;
  let timeoutId: NodeJS.Timeout;

  try {
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<Response>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error('Request timeout'));
      }, 3000);
    });

    // Race between the fetch and the timeout
    const response = await Promise.race([
      fetch(target, {
        method: 'HEAD', // Use HEAD instead of GET for efficiency
        signal,
        headers: {
          'User-Agent': 'URLValidator/1.0', // Add user agent to prevent some 403s
        },
      }),
      timeoutPromise,
    ]);

    clearTimeout(timeoutId!);
    return response.ok;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timeoutId!);
    controller.abort(); // Always abort to clean up
  }
}

async function checkDNS(target: string): Promise<boolean> {
  try {
    const parsedUrl = new URL(target);
    return new Promise((resolve) => {
      dns.lookup(parsedUrl.hostname, (err) => {
        resolve(err === null);
      });
    });
  } catch (error) {
    return false;
  }
}
