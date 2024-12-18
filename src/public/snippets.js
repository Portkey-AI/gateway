const configs = {"nodejs": {}, "python": {}, "curl": {}}

// Node.js - Simple
configs["nodejs"]["simple"] = `
// 1. Create config with provider and API key
const config = {
  "provider": 'openai',
  "api_key": 'Your OpenAI API key',
};

// 2. Add this config to the client
const client = new Portkey({config});

// 3. Use the client in completion requests
await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello, world!' }],
});`

// Node.js - Load Balancing
configs["nodejs"]["loadBalancing"] = `
// 1. Create the load-balanced config
const lbConfig = {
  "strategy": { "mode": "loadbalance" },
  "targets": [{ 
    "provider": 'openai', 
    "api_key": 'Your OpenAI API key', 
    "weight": 0.7 
  },{ 
    "provider": 'anthropic', 
    "api_key": 'Your Anthropic API key', 
    "weight": 0.3,
    "override_params": {
      "model": 'claude-3-opus-20240229' // Any params you want to override
    },
  }],
};

// 2. Use the config in completion requests
await client.chat.completions.create({
  model: 'gpt-4o', // The model will be replaced with the one specified in the config
  messages: [{ role: 'user', content: 'Hello, world!' }],
}, {config: lbConfig});`

// Node.js - Fallbacks
configs["nodejs"]["fallbacks"] = `
// 1. Create the fallback config
const fallbackConfig = {
  "strategy": { "mode": "fallback" },
  "targets": [{ // The primary target
    "provider": 'openai', 
    "api_key": 'Your OpenAI API key', 
  },{ // The fallback target
    "provider": 'anthropic', 
    "api_key": 'Your Anthropic API key', 
  }],
};

// 2. Use the config in completion requests
await client.chat.completions.create({
  model: 'gpt-4o', // The model will be replaced with the one specified in the config
  messages: [{ role: 'user', content: 'Hello, world!' }],
}, {config: fallbackConfig});`

// Node.js - Retries & Timeouts
configs["nodejs"]["autoRetries"] = `
// 1. Create the retry and timeout config
const retryTimeoutConfig = {
  "retry": { 
    "attempts": 3,
    "on_status_codes": [429, 502, 503, 504] // Optional
  },
  "request_timeout": 10000,
  "provider": 'openai', 
  "api_key": 'Your OpenAI API key'
};

// 2. Use the config in completion requests
await client.chat.completions.create({
  model: 'gpt-4o', // The model will be replaced with the one specified in the config
  messages: [{ role: 'user', content: 'Hello, world!' }],
}, {config: retryTimeoutConfig});`

// Python - Simple
configs["python"]["simple"] = `
# 1. Create config with provider and API key
config = {
  "provider": 'openai',
  "api_key": 'Your OpenAI API key',
}

# 2. Add this config to the client
client = Portkey(config=config)

# 3. Use the client in completion requests
client.chat.completions.create(
  model = 'gpt-4o',
  messages = [{ role: 'user', content: 'Hello, world!' }],
)`

// Python - Load Balancing
configs["python"]["loadBalancing"] = `
# 1. Create the load-balanced config
lb_config = {
  "strategy": { "mode": "loadbalance" },
  "targets": [{ 
    "provider": 'openai', 
    "api_key": 'Your OpenAI API key', 
    "weight": 0.7 
  },{ 
    "provider": 'anthropic', 
    "api_key": 'Your Anthropic API key', 
    "weight": 0.3,
    "override_params": {
      "model": 'claude-3-opus-20240229' # Any params you want to override
    },
  }],
}

# 2. Use the config in completion requests
client.with_options(config=lb_config).chat.completions.create(
  model = 'gpt-4o',
  messages = [{ role: 'user', content: 'Hello, world!' }],
)`

// Python - Fallbacks
configs["python"]["fallbacks"] = `
# 1. Create the fallback config
fallback_config = {
  "strategy": { "mode": "fallback" },
  "targets": [{ # The primary target
    "provider": 'openai', 
    "api_key": 'Your OpenAI API key', 
  },{ # The fallback target
    "provider": 'anthropic', 
    "api_key": 'Your Anthropic API key', 
    "override_params": {
      "model": 'claude-3-opus-20240229' # Any params you want to override
    },
  }],
}

# 2. Use the config in completion requests
client.with_options(config=fallback_config).chat.completions.create(
  model = 'gpt-4o',
  messages = [{ role: 'user', content: 'Hello, world!' }],
)`

// Python - Retries & Timeouts
configs["python"]["autoRetries"] = `
# 1. Create the retry and timeout config
retry_timeout_config = {
  "retry": { 
    "attempts": 3,
    "on_status_codes": [429, 502, 503, 504] # Optional
  },
  "request_timeout": 10000,
  "provider": 'openai', 
  "api_key": 'Your OpenAI API key'
}

# 2. Use the config in completion requests
client.with_options(config=retry_timeout_config).chat.completions.create(
  model = 'gpt-4o',
  messages = [{ role: 'user', content: 'Hello, world!' }],
)`

// Curl - Simple
configs["curl"]["simple"] = `
# Store the config in a variable
simple_config='{"provider":"openai","api_key":"Your OpenAI API Key"}'

# Use the config in completion requests
curl http://localhost:8787/v1/chat/completions \
\n-H "Content-Type: application/json" \
\n-H "x-portkey-config: $simple_config" \
\n-d '{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}'`

// Curl - Load Balancing
configs["curl"]["loadBalancing"] = `
# Store the config in a variable
lb_config='{"strategy":{"mode":"loadbalance"},"targets":[{"provider":"openai","api_key":"Your OpenAI API key","weight": 0.7 },{"provider":"anthropic","api_key":"Your Anthropic API key","weight": 0.3,"override_params":{"model":"claude-3-opus-20240229"}}]}'

# Use the config in completion requests
curl http://localhost:8787/v1/chat/completions \
\n-H "Content-Type: application/json" \
\n-H "x-portkey-config: $lb_config" \
\n-d '{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}'`

// Curl - Fallbacks
configs["curl"]["fallbacks"] = `
# Store the config in a variable
fb_config='{"strategy":{"mode":"fallback"},"targets":[{"provider":"openai","api_key":"Your OpenAI API key"},{"provider":"anthropic","api_key":"Your Anthropic API key","override_params":{"model":"claude-3-opus-20240229"}}]}'

# Use the config in completion requests
curl http://localhost:8787/v1/chat/completions \
\n-H "Content-Type: application/json" \
\n-H "x-portkey-config: $fb_config" \
\n-d '{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}'`

// Curl - Retries & Timeouts
configs["curl"]["autoRetries"] = `
# Store the config in a variable
rt_config='{"retry":{"attempts": 3,"on_status_codes": [429, 502, 503, 504]},"request_timeout": 10000, "provider": "openai", "api_key": "Your OpenAI API key"}'

# Use the config in completion requests
curl http://localhost:8787/v1/chat/completions \
\n-H "Content-Type: application/json" \
\n-H "x-portkey-config: $rt_config" \
\n-d '{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}'`