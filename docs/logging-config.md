# Logging Configuration

The MCP Gateway uses a configurable logging system optimized for production environments.

## Production Default

**In production (`NODE_ENV=production`), only ERROR and CRITICAL logs are shown by default.**

## Configuration

Logging can be configured through environment variables:

### `LOG_LEVEL`
Controls the verbosity of logs. Available levels:
- `ERROR` (0) - Only errors (default in production)
- `CRITICAL` (1) - Critical information and errors
- `WARN` (2) - Warnings, critical info, and errors
- `INFO` (3) - General info, warnings, critical, and errors (default in development)
- `DEBUG` (4) - All logs including debug information

### `NODE_ENV`
When set to `production`:
- Default log level is `ERROR`
- Colors are disabled by default
- Only critical information is logged

Example:
```bash
# Production mode - minimal logging
NODE_ENV=production npm start

# Development mode with debug logs
LOG_LEVEL=DEBUG npm start

# Production with critical info
NODE_ENV=production LOG_LEVEL=CRITICAL npm start
```

### `LOG_TIMESTAMP`
Controls whether timestamps are included in logs.
- Default: `true`
- Set to `false` to disable timestamps

Example:
```bash
LOG_TIMESTAMP=false npm start
```

### `LOG_COLORS`
Controls whether logs are colorized.
- Default: `true`
- Set to `false` to disable colors (useful for log files)

Example:
```bash
LOG_COLORS=false npm start > logs.txt
```

## Log Format

Logs follow this format:
```
[timestamp] [prefix] [level] message
```

Example:
```
[2024-01-20T10:30:45.123Z] [MCP-Gateway] [INFO] Creating new session for server: linear
[2024-01-20T10:30:45.456Z] [Session:abc12345] [INFO] Connected to upstream with sse transport
```

## Log Levels Guide

### ERROR
- Connection failures
- Critical errors that prevent operation
- Unhandled exceptions
- Session initialization failures

### CRITICAL
- Server startup/shutdown events
- Session recovery status
- Important lifecycle events that should always be logged

### WARN
- Session not found
- Rate limiting triggered
- Invalid requests
- Non-critical failures

### INFO
- Session creation/restoration
- Transport connections established
- Tool filtering applied
- General operational events

### DEBUG
- Request/response details
- Transport state changes
- Detailed operation flow
- Capability discovery

## Usage in Code

The logger is automatically created with appropriate prefixes:
- `MCP-Gateway` - Main gateway operations
- `Session:{id}` - Session-specific operations (truncated ID for readability)

## Production Recommendations

For production environments (automatic minimal logging):
```bash
NODE_ENV=production npm start
# Only shows errors by default
```

For production with critical events:
```bash
NODE_ENV=production LOG_LEVEL=CRITICAL npm start
# Shows errors + critical lifecycle events
```

For debugging in development:
```bash
LOG_LEVEL=DEBUG npm start
# Shows everything
```

For debugging in production (temporary):
```bash
NODE_ENV=production LOG_LEVEL=INFO npm start
# Override production defaults for troubleshooting
```
