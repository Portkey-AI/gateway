# Lasso Security Plugin

This plugin integrates with Lasso Security's Deputies Public API (v3) to provide content classification and security guardrails for AI applications.

## Overview

Lasso Security is a leading genAI security platform that autonomously monitors interactions, detects risks in real-time, and empowers organizations to adopt AI safely. The Deputies Public API v3 provides a flexible interface for accessing various Deputy services for security classification and policy enforcement, with detailed findings including action types and severity levels.

## Features

- **Content Classification**: Analyze messages for various security risks
- **Real-time Protection**: Block harmful content before it reaches your users
- **Detailed Findings**: Get findings with action types (BLOCK, WARN, AUTO_MASKING) and severity levels
- **Prompt & Completion Analysis**: Classify both input prompts and output completions

## Setup

1. Sign up for a Lasso Security account at [https://app.lasso.security](https://app.lasso.security)
2. Obtain your API key from the Organization Settings page
3. Configure the plugin with your API key

## Credentials

| Credential | Required | Description |
|---|---|---|
| `apiKey` | Yes | Your Lasso Security API key (encrypted) |
| `apiEndpoint` | No | Custom API endpoint URL. Defaults to `https://server.lasso.security` |

## Usage

### Basic Usage

```javascript
// Example configuration
const config = {
  plugins: {
    lasso: {
      classify: {
        credentials: {
          apiKey: 'your-lasso-api-key',
        },
        messages: [
          {
            role: 'user',
            content: 'User message to classify',
          },
          {
            role: 'assistant',
            content: 'Assistant response to classify',
          },
        ],
      },
    },
  },
};
```

### Advanced Usage

```javascript
// Example with additional parameters and custom endpoint
const config = {
  plugins: {
    lasso: {
      classify: {
        credentials: {
          apiKey: 'your-lasso-api-key',
          apiEndpoint: 'https://custom.lasso.example.com',
        },
        messages: [
          {
            role: 'user',
            content: 'User message to classify',
          },
        ],
        conversationId: '01HF3Z7YVDN0SGKPVJ9BQ6RPXE',
        userId: 'user@example.com',
      },
    },
  },
};
```

## Response Format

The plugin returns a v3 response with the following structure:

```json
{
  "deputies": {
    "jailbreak": false,
    "custom-policies": false,
    "sexual": false,
    "hate": false,
    "illegality": true,
    "codetect": false,
    "violence": false,
    "pattern-detection": true
  },
  "violations_detected": true,
  "findings": {
    "pattern-detection": [
      {
        "name": "Email Address",
        "category": "PERSONAL_IDENTIFIABLE_INFORMATION",
        "action": "AUTO_MASKING",
        "severity": "HIGH"
      }
    ],
    "illegality": [
      {
        "name": "Illegality",
        "category": "SAFETY",
        "score": 0.9908,
        "action": "BLOCK",
        "severity": "MEDIUM"
      }
    ]
  }
}
```

## Verdict Behavior

The plugin determines whether to block a request based on the combination of `violations_detected` and the `action` field in findings:

| Scenario | Verdict | Behavior |
|---|---|---|
| No violations detected | `true` (allow) | Request passes through |
| Violations with `BLOCK` action | `false` (block) | Request is blocked |
| Violations with only `WARN` actions | `true` (allow) | Request passes through, findings included in response data |
| Violations with only `AUTO_MASKING` actions | `true` (allow) | Request passes through, findings included in response data |
| API error | `false` (block) | Request is blocked (fail-safe) |

## Support

For support or questions, contact Lasso Security at [support@lasso.security](mailto:support@lasso.security) or visit [https://lasso.security](https://lasso.security).
