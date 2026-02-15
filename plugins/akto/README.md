# Akto API Security Guardrail Plugin

## Overview

The Akto plugin provides advanced API security and threat detection capabilities for your LLM applications through the Portkey AI Gateway. It helps protect against:

- **PII Detection**: Identifies personally identifiable information in prompts and responses
- **Prompt Injection**: Detects attempts to manipulate the LLM through malicious prompts
- **Toxicity Detection**: Identifies harmful, toxic, or inappropriate content

## Installation

1. Add the Akto plugin to your `conf.json`:

```json
{
  "plugins_enabled": ["default", "akto"],
  "credentials": {
    "akto": {
      "apiKey": "your-akto-api-key",
      "baseUrl": "https://1726615470-guardrails.akto.io"
    }
  }
}
```

2. Build the plugins:

```bash
npm run build-plugins
```

## Configuration

### Credentials

- **apiKey** (required): Your Akto API key for authentication
- **baseUrl** (optional): The base URL for Akto API. Defaults to `https://1726615470-guardrails.akto.io`

### Parameters

The Akto guardrail supports the following parameters:

- **timeout** (number, default: `5000`): The timeout in milliseconds for the Akto guardrail scan

## Usage

### Using with Portkey Config

Add the Akto guardrail to your Portkey config:

```json
{
  "beforeRequestHooks": [
    {
      "id": "akto-scan",
      "credentials": "akto",
      "parameters": {
        "timeout": 5000
      }
    }
  ]
}
```

### Scanning Responses

You can also scan LLM responses using the `afterRequestHook`:

```json
{
  "afterRequestHooks": [
    {
      "id": "akto-scan",
      "credentials": "akto",
      "parameters": {
        "timeout": 5000
      }
    }
  ]
}
```

## Response Format

The plugin returns:

- **verdict**: `true` if content is safe, `false` if threats detected
- **data**: Array of scan results containing:
  - `threat_detected`: Boolean indicating if any threats were found
  - `threat_score`: Overall threat score (0-1)
  - `threats`: Array of detected threats with type, severity, and description
  - `details`: Breakdown of specific checks (PII, prompt injection, toxicity)

## Testing

Run the tests with:

```bash
npm run test:plugins -- akto
```

For live API testing, create a `.creds.json` file in the `plugins/akto` directory:

```json
{
  "apiKey": "your-test-api-key",
  "baseUrl": "https://1726615470-guardrails.akto.io"
}
```

## Error Handling

The plugin follows a "fail open" approach - if the Akto API is unavailable or returns an error, the request will be allowed to proceed. This ensures that temporary API issues don't block legitimate traffic.

## Support

For issues with the Akto plugin or API, please refer to:
- [Akto Documentation](https://docs.akto.io)
- [Portkey Gateway Issues](https://github.com/Portkey-AI/gateway/issues)
