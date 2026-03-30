# Levo AI Plugin

This plugin integrates Portkey Gateway with Levo AI's API security and observability platform, enabling comprehensive monitoring, analysis, and security testing of LLM API traffic.

## Overview

Levo AI is an API security and observability platform that helps organizations secure and monitor their APIs in production. The Portkey Gateway plugin sends request and response traces to your Levo AI Collector in OpenTelemetry (OTLP) format, enabling deep visibility into your LLM API traffic.

## Features

- **Complete API Visibility**: Capture full request and response payloads for all LLM API calls
- **Security Analysis**: Detect sensitive data (PII, secrets) and security issues in API traffic  
- **Performance Monitoring**: Track latency, error rates, and throughput across all LLM providers
- **Cost Attribution**: Monitor token usage and costs per user, team, or application
- **Distributed Tracing**: Correlate traces across your infrastructure with OpenTelemetry standards
- **Multi-Tenant Support**: Route traces by organization and workspace for multi-tenant deployments

## Setup

### Prerequisites

1. **Levo AI Collector**: Deploy the Levo AI Collector in your environment ([deployment guide](https://docs.levo.ai/))
2. **Organization ID**: Obtain your Levo organization ID from your Levo AI account settings
3. **Network Access**: Ensure Portkey Gateway can reach your Levo AI Collector endpoint

### Configuration

The plugin is configured via the `x-portkey-config` header or Portkey SDK configuration.

## Usage

### Using with x-portkey-config Header

```json
{
  "provider": "openai",
  "api_key": "your-openai-key",
  "after_request_hooks": [
    {
      "id": "levo.observability",
      "organizationId": "your-levo-org-id",
      "endpoint": "http://levo-collector:4318/v1/traces"
    }
  ]
}
```

### Using with Portkey SDK (Node.js)

```javascript
import Portkey from 'portkey-ai';

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  config: {
    provider: 'openai',
    api_key: process.env.OPENAI_API_KEY,
    after_request_hooks: [
      {
        id: 'levo.observability',
        organizationId: process.env.LEVO_ORG_ID,
        endpoint: process.env.LEVO_COLLECTOR_URL,
      },
    ],
  },
});

const response = await portkey.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Using with Portkey SDK (Python)

```python
from portkey_ai import Portkey
import os

portkey = Portkey(
    api_key=os.environ["PORTKEY_API_KEY"],
    config={
        "provider": "openai",
        "api_key": os.environ["OPENAI_API_KEY"],
        "after_request_hooks": [
            {
                "id": "levo.observability",
                "organizationId": os.environ["LEVO_ORG_ID"],
                "endpoint": os.environ["LEVO_COLLECTOR_URL"],
            }
        ],
    },
)

response = portkey.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Multi-Tenant Configuration

For multi-tenant deployments, include both `organizationId` and `workspaceId`:

```json
{
  "provider": "anthropic",
  "api_key": "your-anthropic-key",
  "after_request_hooks": [
    {
      "id": "levo.observability",
      "organizationId": "org-123",
      "workspaceId": "workspace-456",
      "endpoint": "http://levo-collector:4318/v1/traces"
    }
  ]
}
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `organizationId` | string | **Yes** | - | Your Levo AI organization ID. Used for routing traces to the correct tenant. |
| `endpoint` | string | No | `http://localhost:4318/v1/traces` | URL of your Levo AI Collector OTLP HTTP endpoint. |
| `workspaceId` | string | No | - | Workspace ID for routing traces within your organization (multi-tenant). |
| `timeout` | number | No | `5000` | Request timeout in milliseconds for sending traces to collector. |
| `headers` | string | No | - | Additional HTTP headers as JSON string (e.g., `'{"Authorization": "Bearer token"}'`). |

## How It Works

1. **Capture**: The plugin captures request and response data from Portkey Gateway after each LLM API call
2. **Transform**: Request and response data is converted to OpenTelemetry (OTLP) trace format with two spans: `REQUEST_ROOT` and `RESPONSE_ROOT`
3. **Enrich**: Traces are enriched with metadata including provider, model, token usage, and custom tags
4. **Route**: Traces are sent to your Levo AI Collector with organization/workspace headers for multi-tenant routing
5. **Analyze**: Levo AI Collector processes traces for security analysis, anomaly detection, and observability

## Data Captured

The plugin captures comprehensive data for each LLM API call:

**Request Data:**
- HTTP method, URL, and headers
- Request body (prompt, messages, parameters)
- Provider and model information
- Request metadata and tags

**Response Data:**
- HTTP status code and headers  
- Response body (completion, choices, usage)
- Token counts (input, output, total)
- Latency and timing information

**Trace Correlation:**
- Trace ID for distributed tracing
- Span IDs for request and response
- Parent span ID for trace hierarchy

## Limitations

- **Streaming Responses**: Streaming responses are not currently supported; plugin will skip streaming requests
- **Success Only**: Plugin executes only on successful LLM responses (HTTP 200); errors are logged separately
- **Collector Required**: Requires Levo AI Collector to be deployed and accessible from Portkey Gateway
- **OTLP Format**: Collector must support OTLP HTTP/JSON protocol on the configured endpoint

## Troubleshooting

### Plugin Not Sending Traces

1. Verify Levo AI Collector is running and accessible
2. Check network connectivity: `curl http://levo-collector:4318/v1/traces`
3. Verify `organizationId` is correct
4. Check Portkey Gateway logs for plugin execution errors

### Traces Not Appearing in Levo AI

1. Verify collector is configured to route OTLP traces correctly
2. Check collector logs for processing errors  
3. Verify organization ID matches your Levo AI account
4. Ensure collector can reach Levo AI backend

### Performance Issues

1. Increase `timeout` parameter if collector is slow
2. Check network latency between gateway and collector
3. Monitor collector resource usage (CPU, memory)
4. Consider deploying collector closer to gateway

## Support

- **Levo AI Documentation**: [https://docs.levo.ai](https://docs.levo.ai)
- **Levo AI Support**: [support@levo.ai](mailto:support@levo.ai)
- **Portkey Gateway**: [https://portkey.ai](https://portkey.ai)
- **GitHub Issues**: [https://github.com/Portkey-AI/gateway/issues](https://github.com/Portkey-AI/gateway/issues)
