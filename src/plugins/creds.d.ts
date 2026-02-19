/**
 * Type declarations for credential JSON files used in plugin tests.
 * These files are gitignored and must be created locally by developers.
 */

declare module '*/.creds.json' {
  const value: Record<string, any>;
  export default value;
}

declare module '*/creds.json' {
  const value: Record<string, any>;
  export default value;
}

declare module '*/.parameters.json' {
  const value: Record<string, any>;
  export default value;
}
