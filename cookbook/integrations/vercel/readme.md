# Portkey + Vercel AI SDK

Portkey natively integrates with the Vercel AI SDK to make your apps production-ready and reliable. Just import Portkey's Vercel package and use it as a provider in your Vercel AI app to enable all of Portkey features:

- Full-stack observability and tracing for all requests
- Interoperability across 250+ LLMS
- Built-in 50+ SOTA guardrails
- Simple & semantic caching to save costs & time
- Route requests conditionally and make them robust with fallbacks, load-balancing, automatic retries, and more
- Continuous improvement based on user feedback

## Getting Started


Getting Started
Follow these steps to get your Vercel app up and running:

Install Dependencies
Run the following command to install all necessary dependencies:
Copynpm install

Configure API Keys
Add your API keys to the appropriate configuration file. This step is crucial for the app to function correctly.
Start the App
Once you've completed the above steps, your app will be running locally. You can access it at:
Copyhttp://localhost:3000
(Note: The port number might be different depending on your specific Vercel app configuration)

### 1. Installation

```sh
npm install @portkey-ai/vercel-provider
npm install
```

### 3. Configure API Keys
Add your API keys to the appropriate configuration file. This step is crucial for the app to function correctly.
Start the App

### 2. Import & Configure Portkey Object

Sign up for Portkey and get your API key, and configure Portkey provider in your Vercel app:

```javascript
import { createPortkey } from '@portkey-ai/vercel-provider';

const portkeyConfig = {
      "provider": "openai", // Choose your provider (e.g., 'anthropic')
      "api_key": "OPENAI_API_KEY",
      "override_params": {
          "model": "gpt-4" // Select from 250+ models
        }
};

const portkey = createPortkey({
  apiKey: 'YOUR_PORTKEY_API_KEY',
  config: portkeyConfig,
});
```
### 3. Configure API Keys
Add your API keys to the appropriate configuration file. This step is crucial for the app to function correctly.


### 4. Start the App
Once you've completed the above steps use `npm run dev` to run your app locally. You can access it at:
`http://localhost:3000`

Portkey's configs are a powerful way to manage & govern your app's behaviour. Learn more about Configs [here](https://docs.portkey.ai).

## Using Vercel Functions

Portkey provider works with all of Vercel functions `generateText` & `streamText`.

Here's how to use them with Portkey:

### generateText

```javascript
import { createPortkey } from '@portkey-ai/vercel-provider';
import { generateText } from 'ai';

const portkeyConfig = {
      "provider": "openai", // Choose your provider (e.g., 'anthropic')
      "api_key": "OPENAI_API_KEY",
      "override_params": {
          "model": "gpt-4"
        }
};

const portkey = createPortkey({
  apiKey: 'YOUR_PORTKEY_API_KEY',
  config: portkeyConfig,
});

const { text } = await generateText({
  model: portkey.chatModel(''), // Provide an empty string, we defined the model in the config
  prompt: 'What is Portkey?',
});

console.log(text);
```



### streamText

```js
import { createPortkey } from '@portkey-ai/vercel-provider';
import { streamText } from 'ai';

const portkeyConfig = {
      "provider": "openai", // Choose your provider (e.g., 'anthropic')
      "api_key": "OPENAI_API_KEY",
      "override_params": {
        "model": "gpt-4o" // Select from 250+ models
  } 
};

const portkey = createPortkey({
  apiKey: 'YOUR_PORTKEY_API_KEY',
  config: portkeyConfig,
});

const result = await streamText({
  model: portkey('gpt-4-turbo'), // This gets overwritten by config
  prompt: 'Invent a new holiday and describe its traditions.',
});

for await (const chunk of result) {
  console.log(chunk);
} 
```

Portkey supports `chatModel` and `completionModel` to easily handle chatbots or text completions. In the above examples, we used `portkey.chatModel` for generateText.

## Tool Calling with Portkey

Portkey supports Tool calling with Vercel AI SDK. Here's how:

```javascript
import { z } from 'zod';
import { generateText, tool } from 'ai';

const result = await generateText({
  model: portkey.chatModel('gpt-4-turbo'),
  tools: {
    weather: tool({
      description: 'Get the weather in a location',
      parameters: z.object({
        location: z.string().describe('The location to get the weather for'),
      }),
      execute: async ({ location }) => ({
        location,
        temperature: 72 + Math.floor(Math.random() * 21) - 10,
      }),
    }),
  },
  prompt: 'What is the weather in San Francisco?',
});
```

## Portkey Features

Portkey Helps you make your Vercel app more robust and reliable. The portkey config is a modular way to make it work for you in whatever way you want. 

### Interoperability

Portkey allows you to easily switch between 250+ AI models by simply changing the model name in your configuration. This flexibility enables you to adapt to the evolving AI landscape without significant code changes.

#### Switch from OpenAI to Anthropic

Here's how you'd use OpenAI with Portkey's Vercel integration:

```javascript
const portkeyConfig = {
      "provider": "openai",
      "api_key": "OPENAI_API_KEY",
      "override_params": {
          model: "gpt-4"
        }
};
```

Now, to switch to Anthropic, just change your provider slug to anthropic and enter your Anthropic API key along with the model of choice:

```javascript
const portkeyConfig = {
      "provider": "anthropic",
      "api_key": "Anthropic_API_KEY",
      "override_params": {
          "model": "claude-3-sonnet-20240229"
        }
      
};
```

### Observability

Portkey's OpenTelemetry-compliant observability suite gives you complete control over all your requests. And Portkey's analytics dashboards provide 40+ key insights you're looking for including cost, tokens, latency, etc. Fast.




### Reliability

Portkey enhances the robustness of your AI applications with built-in features such as Caching, Fallback mechanisms, Load balancing, Conditional routing, Request timeouts, etc. 

Here is how you can modify your config to include the following Portkey features:  

#### Fallback

```javascript
import { createPortkey } from '@portkey-ai/vercel-provider';
import { generateText } from 'ai';

const portkeyConfig =  {
	"strategy": {
		"mode": "fallback"
	},
	"targets": [
		{ 
		"provider": "anthropic",
	      	"api_key": "Anthropic_API_KEY",
	      	"override_params": {
	          "model": "claude-3-sonnet-20240229"
	        } },
		{
		"provider": "openai",
     	 	"api_key": "OPENAI_API_KEY",
      		"override_params": {
          		"model": "gpt-4"
        } }
	]
}

const portkey = createPortkey({
  apiKey: 'YOUR_PORTKEY_API_KEY',
  config: portkeyConfig,
});

const { text } = await generateText({
  model: portkey.chatModel(''),
  prompt: 'What is Portkey?',
});

console.log(text);
```

Learn more about Portkey's AI gateway features in detail [here](https://docs.portkey.ai/features/ai-gateway).

### Guardrails

Portkey Guardrails allow you to enforce LLM behavior in real-time, verifying both inputs and outputs against specified checks. 

You can create Guardrail checks in UI and then pass them in your Portkey Configs with before request or after request hooks.

Read more about Guardrails [here](https://docs.portkey.ai/features/guardrails).

## Portkey Config

Many of these features are driven by Portkey's Config architecture. The Portkey app simplifies creating, managing, and versioning your Configs.

For more information on using these features and setting up your Config, please refer to the [Portkey documentation](https://docs.portkey.ai).
