#!/usr/bin/env node

import { serve } from '@hono/node-server'

import app from './index'

serve({
  fetch: app.fetch,
  port: 8787,
})

console.log("Your AI Gateway is now running on http://localhost:8787 🚀")