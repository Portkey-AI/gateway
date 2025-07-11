# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Portkey AI Gateway** - a fast, reliable AI gateway that routes requests to 250+ LLMs with sub-1ms latency. It's built with Hono framework for TypeScript/JavaScript and can be deployed to multiple environments including Cloudflare Workers, Node.js servers, and Docker containers.

## Development Commands

### Core Development
- `npm run dev` - Start development server using Wrangler (Cloudflare Workers)
- `npm run dev:node` - Start development server using Node.js
- `npm run build` - Build the project for production
- `npm run build-plugins` - Build the plugin system

### Testing
- `npm run test:gateway` - Run tests for the main gateway code (src/)
- `npm run test:plugins` - Run tests for plugins
- `jest src/` - Run specific gateway tests
- `jest plugins/` - Run specific plugin tests

### Code Quality
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run pretty` - Alternative format command

### Deployment
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run start:node` - Start production Node.js server

## Architecture

### Core Components

**Main Application (`src/index.ts`)**
- Hono-based HTTP server with middleware pipeline
- Handles multiple AI provider integrations
- Routes: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, etc.

**Provider System (`src/providers/`)**
- Modular provider implementations (OpenAI, Anthropic, Azure, etc.)
- Each provider has standardized interface: `api.ts`, `chatComplete.ts`, `embed.ts`
- Provider configs define supported features and transformations

**Middleware Pipeline**
- `requestValidator` - Validates incoming requests
- `hooks` - Pre/post request hooks
- `memoryCache` - Response caching
- `logger` - Request/response logging
- `portkey` - Core Portkey-specific middleware for routing, guardrails, etc.

**Plugin System (`plugins/`)**
- Guardrail plugins for content filtering, PII detection, etc.
- Each plugin has `manifest.json` defining capabilities
- Plugins are built separately with `npm run build-plugins`

### Key Concepts

**Configs** - JSON configurations that define:
- Provider routing and fallbacks
- Load balancing strategies
- Guardrails and content filtering
- Caching and retry policies

**Handlers** - Route-specific request processors in `src/handlers/`
- Each AI API endpoint has dedicated handler
- Stream handling for real-time responses
- WebSocket support for realtime APIs

## File Structure

- `src/providers/` - AI provider integrations
- `src/handlers/` - API endpoint handlers
- `src/middlewares/` - Request/response middleware
- `plugins/` - Guardrail and validation plugins
- `cookbook/` - Example integrations and use cases
- `conf.json` - Runtime configuration

## Testing Strategy

Tests are organized by component:
- `src/tests/` - Core gateway functionality tests
- `src/handlers/__tests__/` - Handler-specific tests
- `plugins/*/**.test.ts` - Plugin tests
- Test timeout: 30 seconds (configured in jest.config.js)

## Configuration

The gateway uses `conf.json` for runtime configuration. Sample config available in `conf_sample.json`.

Key environment variables and configuration handled through Hono's adapter system for multi-environment deployment.