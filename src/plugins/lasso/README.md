# Lasso Security Plugin

This plugin integrates with Lasso Security's Deputies Public API to provide content classification and security guardrails for AI applications.

## Overview

Lasso Security is a leading genAI security platform that autonomously monitors interactions, detects risks in real-time, and empowers organizations to adopt AI safely. The Deputies Public API provides a flexible interface for accessing various Deputy services for security classification and policy enforcement.

## Features

- **Content Classification**: Analyze messages for various security risks
- **Real-time Protection**: Block harmful content before it reaches your users
- **Detailed Results**: Get comprehensive classification results with confidence scores

## Setup

1. Sign up for a Lasso Security account at [https://app.lasso.security](https://app.lasso.security)
2. Obtain your API key from the Organization Settings page
3. Configure the plugin with your API key

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
// Example with additional parameters
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
        ],
        conversationId: 'unique-conversation-id',
        userId: 'user-123',
      },
    },
  },
};
```

## Response Format

The plugin returns a response with the following structure:

```json
{
  "deputies": {
    "jailbreak": false,
    "custom-policies": false,
    "sexual": false,
    "hate": false,
    "illegality": false,
    "violence": false,
    "pattern-detection": true
  },
  "deputies_predictions": {
    "jailbreak": 0.123,
    "custom-policies": 0.234,
    "sexual": 0.145,
    "hate": 0.156,
    "illegality": 0.167,
    "violence": 0.178,
    "pattern-detection": 0.989
  },
  "violations_detected": true
}
```

## Support

For support or questions, contact Lasso Security at [support@lasso.security](mailto:support@lasso.security) or visit [https://lasso.security](https://lasso.security).
