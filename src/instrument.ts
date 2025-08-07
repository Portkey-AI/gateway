import * as Sentry from '@sentry/node';

// Ensure to call this before requiring any other modules!
Sentry.init({
  dsn: 'https://141013471ab85e4a32b5c58d69510742@o1154715.ingest.us.sentry.io/4509125385781248',
  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for tracing.
  // We recommend adjusting this value in production
  // Learn more at
  // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#tracesSampleRate
  tracesSampleRate: 1.0,

  // Set profilesSampleRate to 1.0 to profile 100%
  // of sampled transactions.
  // This is relative to tracesSampleRate
  // Learn more at
  // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#profilesSampleRate
  profilesSampleRate: 1.0,

  normalizeDepth: 10,

  environment: process.env.NODE_ENV,
});
