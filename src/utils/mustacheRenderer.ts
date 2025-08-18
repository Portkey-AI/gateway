import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// @ts-ignore
import Mustache from '@portkey-ai/mustache';

/**
 * Mustache-based template renderer for OAuth HTML templates
 */
export class MustacheTemplateRenderer {
  private templateCache = new Map<string, string>();
  private templateDir: string;

  constructor() {
    // Get the directory of the current module
    const currentDir = dirname(fileURLToPath(import.meta.url));
    this.templateDir = join(currentDir, '../templates');
  }

  /**
   * Load and cache a template file
   */
  private loadTemplate(templatePath: string): string {
    if (this.templateCache.has(templatePath)) {
      return this.templateCache.get(templatePath)!;
    }

    try {
      const fullPath = join(this.templateDir, templatePath);
      const template = readFileSync(fullPath, 'utf-8');
      this.templateCache.set(templatePath, template);
      return template;
    } catch (error) {
      throw new Error(
        `Failed to load template: ${templatePath}. Error: ${error}`
      );
    }
  }

  /**
   * Render a template with Mustache
   */
  render(templatePath: string, data: any): string {
    const template = this.loadTemplate(templatePath);
    return Mustache.render(template, data);
  }

  /**
   * Clear the template cache (useful for development)
   */
  clearCache(): void {
    this.templateCache.clear();
  }
}

// OAuth-specific template renderer with helper methods
export class OAuthMustacheRenderer extends MustacheTemplateRenderer {
  /**
   * Render the invalid client error page
   */
  renderInvalidClientError(clientId: string): string {
    return this.render('oauth/error-invalid-client.html', {
      clientId,
    });
  }

  /**
   * Render the invalid redirect URI error page
   */
  renderInvalidRedirectError(
    redirectUri: string,
    registeredUris: string
  ): string {
    return this.render('oauth/error-invalid-redirect.html', {
      redirectUri,
      registeredUris,
    });
  }

  /**
   * Render the OAuth consent form
   */
  renderConsentForm(params: {
    clientId: string;
    clientName: string;
    clientLogoUri?: string;
    clientUri?: string;
    redirectUri: string;
    redirectUris?: string[];
    state: string;
    scope: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  }): string {
    const {
      clientId,
      clientName,
      clientLogoUri,
      clientUri,
      redirectUri,
      redirectUris,
      state,
      scope,
      codeChallenge,
      codeChallengeMethod,
    } = params;

    // Prepare data for Mustache template
    const templateData = {
      clientId,
      clientName,
      redirectUri,
      state: state || '',
      scope,

      // Client logo logic
      hasClientLogo: !!clientLogoUri,
      clientLogoUri,
      clientInitial: clientName.charAt(0).toUpperCase(),

      // Optional fields
      hasClientUri: !!clientUri,
      clientUri,

      // Redirect URIs
      hasRedirectUris: redirectUris && redirectUris.length > 0,
      redirectUrisDisplay: redirectUris
        ? redirectUris.join(', ').slice(0, 30) + '...'
        : '',
      redirectUrisTitle: redirectUris ? redirectUris.join(', ') : '',

      // PKCE fields
      hasCodeChallenge: !!codeChallenge,
      codeChallenge,
      hasCodeChallengeMethod: !!codeChallengeMethod,
      codeChallengeMethod,

      // Permissions based on scope
      permissions: {
        servers: scope.includes('mcp:servers') || scope.includes('mcp:*'),
        tools: scope.includes('mcp:tools') || scope.includes('mcp:*'),
        resources: scope.includes('mcp:resources') || scope.includes('mcp:*'),
        prompts: scope.includes('mcp:prompts') || scope.includes('mcp:*'),
      },
    };

    return this.render('oauth/consent-form.html', templateData);
  }
}

// Create a singleton instance for use throughout the application
export const oauthMustacheRenderer = new OAuthMustacheRenderer();
