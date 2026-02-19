declare module '@portkey-ai/mustache' {
  import * as Mustache from 'mustache';

  interface MustacheModule {
    render: typeof Mustache.render;
    parse: typeof Mustache.parse;
    escape: typeof Mustache.escape;
    clearCache: typeof Mustache.clearCache;
    Scanner: typeof Mustache.Scanner;
    Context: typeof Mustache.Context;
    Writer: typeof Mustache.Writer;
    getTemplateDetails(template: string): {
      variables: string[];
      partials: string[];
      variablePartials: string[];
      sections: string[];
      sectionVariables: Record<string, string[]>;
    };
  }

  const mustache: MustacheModule;
  export default mustache;
}
