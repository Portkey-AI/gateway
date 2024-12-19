// function bedrockConfigNode(vars) {
//   return `,
//   <span class="hljs-attr">awsAccessKeyId</span>: <span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.awsAccessKeyId ? 'filled' : 'empty'}" id="awsAccessKeyIdValue">${vars.providerDetails?.awsAccessKeyId || '[Click to edit]'}</span>"</span>,
//   <span class="hljs-attr">awsSecretAccessKey</span>: <span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.awsSecretAccessKey ? 'filled' : 'empty'}" id="awsSecretAccessKeyValue">${vars.providerDetails?.awsSecretAccessKey || '[Click to edit]'}</span>"</span>,
//   <span class="hljs-attr">awsRegion</span>: <span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.awsRegion ? 'filled' : 'empty'}" id="awsRegionValue">${vars.providerDetails?.awsRegion || '[Click to edit]'}</span>"</span>${vars.providerDetails?.awsSessionToken ? `,
//   <span class="hljs-attr">awsSessionToken</span>: <span class="hljs-string">"<span class="highlighted-value filled" id="awsSessionTokenValue">${vars.providerDetails.awsSessionToken}</span>"</span>` : ''}`;
// }

// function bedrockConfigPython(vars) {
//   return `,
//     <span class="hljs-attr">aws_access_key_id</span>=<span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.awsAccessKeyId ? 'filled' : 'empty'}" id="awsAccessKeyIdValue">${vars.providerDetails?.awsAccessKeyId || '[Click to edit]'}</span>"</span>,
//     <span class="hljs-attr">aws_secret_access_key</span>=<span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.awsSecretAccessKey ? 'filled' : 'empty'}" id="awsSecretAccessKeyValue">${vars.providerDetails?.awsSecretAccessKey || '[Click to edit]'}</span>"</span>,
//     <span class="hljs-attr">aws_region</span>=<span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.awsRegion ? 'filled' : 'empty'}" id="awsRegionValue">${vars.providerDetails?.awsRegion || '[Click to edit]'}</span>"</span>${vars.providerDetails?.awsSessionToken ? `,
//     <span class="hljs-attr">aws_session_token</span>=<span class="hljs-string">"<span class="highlighted-value filled" id="awsSessionTokenValue">${vars.providerDetails.awsSessionToken}</span>"</span>` : ''}`;
// }

// function bedrockConfigCurl(vars) {
//   return `\n-H <span class="hljs-string">"x-portkey-aws-access-key-id: <span class="highlighted-value ${vars.providerDetails?.awsAccessKeyId ? 'filled' : 'empty'}" id="awsAccessKeyIdValue">${vars.providerDetails?.awsAccessKeyId || '[Click to edit]'}</span>"</span> \\
// -H <span class="hljs-string">"x-portkey-aws-secret-access-key: <span class="highlighted-value ${vars.providerDetails?.awsSecretAccessKey ? 'filled' : 'empty'}" id="awsSecretAccessKeyValue">${vars.providerDetails?.awsSecretAccessKey || '[Click to edit]'}</span>"</span> \\
// -H <span class="hljs-string">"x-portkey-aws-region: <span class="highlighted-value ${vars.providerDetails?.awsRegion ? 'filled' : 'empty'}" id="awsRegionValue">${vars.providerDetails?.awsRegion || '[Click to edit]'}</span>"</span> \\${vars.providerDetails?.awsSessionToken ? `\n-H <span class="hljs-string">"x-portkey-aws-session-token: <span class="highlighted-value filled" id="awsSessionTokenValue">${vars.providerDetails.awsSessionToken}</span>"</span> \\` : ''}`;
// }

// function azureConfigCurl(vars) {
//   return `\n-H <span class="hljs-string">"x-portkey-azure-resource-name: <span class="highlighted-value ${vars.providerDetails?.azureResourceName ? 'filled' : 'empty'}" id="azureResourceNameValue">${vars.providerDetails?.azureResourceName || '[Click to edit]'}</span>"</span> \\
// -H <span class="hljs-string">"x-portkey-azure-deployment-id: <span class="highlighted-value ${vars.providerDetails?.azureDeploymentId ? 'filled' : 'empty'}" id="azureDeploymentIdValue">${vars.providerDetails?.azureDeploymentId || '[Click to edit]'}</span>"</span> \\
// -H <span class="hljs-string">"x-portkey-azure-api-version: <span class="highlighted-value ${vars.providerDetails?.azureApiVersion ? 'filled' : 'empty'}" id="azureApiVersionValue">${vars.providerDetails?.azureApiVersion || '[Click to edit]'}</span>"</span> \\
// -H <span class="hljs-string">"x-portkey-azure-model-name: <span class="highlighted-value ${vars.providerDetails?.azureModelName ? 'filled' : 'empty'}" id="azureModelNameValue">${vars.providerDetails?.azureModelName || '[Click to edit]'}</span>"</span> \\`;
// }

// function azureConfigNode(vars) {
//   return `,
//   <span class="hljs-attr">azureResourceName</span>: <span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.azureResourceName ? 'filled' : 'empty'}" id="azureResourceNameValue">${vars.providerDetails?.azureResourceName || '[Click to edit]'}</span>"</span>,
//   <span class="hljs-attr">azureDeploymentId</span>: <span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.azureDeploymentId ? 'filled' : 'empty'}" id="azureDeploymentIdValue">${vars.providerDetails?.azureDeploymentId || '[Click to edit]'}</span>"</span>,
//   <span class="hljs-attr">azureApiVersion</span>: <span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.azureApiVersion ? 'filled' : 'empty'}" id="azureApiVersionValue">${vars.providerDetails?.azureApiVersion || '[Click to edit]'}</span>"</span>,
//   <span class="hljs-attr">azureModelName</span>: <span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.azureModelName ? 'filled' : 'empty'}" id="azureModelNameValue">${vars.providerDetails?.azureModelName || '[Click to edit]'}</span>"</span>`;
// }

// function azureConfigPython(vars) {
//   return `,
//   <span class="hljs-attr">azure_resource_name</span>=<span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.azureResourceName ? 'filled' : 'empty'}" id="azureResourceNameValue">${vars.providerDetails?.azureResourceName || '[Click to edit]'}</span>"</span>,
//   <span class="hljs-attr">azure_deployment_id</span>=<span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.azureDeploymentId ? 'filled' : 'empty'}" id="azureDeploymentIdValue">${vars.providerDetails?.azureDeploymentId || '[Click to edit]'}</span>"</span>,
//   <span class="hljs-attr">azure_api_version</span>=<span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.azureApiVersion ? 'filled' : 'empty'}" id="azureApiVersionValue">${vars.providerDetails?.azureApiVersion || '[Click to edit]'}</span>"</span>,
//   <span class="hljs-attr">azure_model_name</span>=<span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.azureModelName ? 'filled' : 'empty'}" id="azureModelNameValue">${vars.providerDetails?.azureModelName || '[Click to edit]'}</span>"</span>`;
// }

// Case conversion utilities
function toCamelCase(str) {
  return str.replace(/([-_][a-z])/g, group => 
    group.toUpperCase()
      .replace('-', '')
      .replace('_', '')
  );
}

function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toKebabCase(str) {
  return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

// Base configuration fields for each provider
const providerConfigs = {
  bedrock: {
    fields: [
      'awsAccessKeyId',
      'awsSecretAccessKey', 
      'awsRegion',
      'awsSessionToken'
    ]
  },
  azure: {
    fields: [
      'azureResourceName',
      'azureDeploymentId',
      'azureApiVersion',
      'azureModelName'
    ]
  }
};

const modelMap = {
  "openai": "gpt-4o-mini",
  "anthropic": "claude-3-5-sonnet-20240620",
  "groq": "llama3-70b-8192",
  "bedrock": "anthropic.claude-3-sonnet-20240229-v1:0",
  "azure-openai": "gpt-4o-mini",
  "cohere": "command-r-plus",
  "together-ai": "llama-3.1-8b-instruct",
  "perplexity-ai": "pplx-7b-online",
  "mistral-ai": "mistral-small-latest",
  "others": "gpt-4o-mini"
}

const docsMap = {
  "openai": "https://portkey.ai/docs/integrations/llms/openai",
  "anthropic": "https://portkey.ai/docs/integrations/llms/anthropic",
  "groq": "https://portkey.ai/docs/integrations/llms/groq",
  "bedrock": "https://portkey.ai/docs/integrations/llms/aws-bedrock",
  "azure-openai": "https://portkey.ai/docs/integrations/llms/azure-openai",
  "cohere": "https://portkey.ai/docs/integrations/llms/cohere",
  "together-ai": "https://portkey.ai/docs/integrations/llms/together-ai",
  "perplexity-ai": "https://portkey.ai/docs/integrations/llms/perplexity-ai",
  "mistral-ai": "https://portkey.ai/docs/integrations/llms/mistral-ai",
  "others": "https://portkey.ai/docs/integrations/llms"
}

// Format generators for different styles
const formatGenerators = {
  node: {
    formatKey: fieldName => fieldName,
    separator: ':',
    indent: '  ',
    template: (key, separator, value) => 
      `  <span class="hljs-attr">${key}</span>${separator}<span class="hljs-string">"${value}"</span>`,
    joinWith: ',\n',
    prefix: ',\n',
  },
  python: {
    formatKey: fieldName => toSnakeCase(fieldName),
    separator: '=',
    indent: '    ',
    template: (key, separator, value) => 
      `    <span class="hljs-attr">${key}</span>${separator}<span class="hljs-string">"${value}"</span>`,
    joinWith: ',\n',
    prefix: ',\n',
  },
  curl: {
    formatKey: fieldName => `x-portkey-${toKebabCase(fieldName)}`,
    separator: ':',
    indent: '',
    template: (key, separator, value) => 
      `-H <span class="hljs-string">"${key}${separator} ${value}"</span> \\`,
    joinWith: '\n',
    prefix: '\n',
  }
};

// Helper function to generate highlighted value span
function generateHighlightedValue(value, id) {
  const isEmpty = !value;
  const displayValue = value || '[Click to edit]';
  return `<span class="highlighted-value ${isEmpty ? 'empty' : 'filled'}" id="${id}Value">${displayValue}</span>`;
}

// Generic config generator function
function generateConfig(provider, format, vars) {
  const { fields } = providerConfigs[provider];
  const formatter = formatGenerators[format];
  const details = vars.providerDetails || {};
  
  const configLines = fields
    .map(fieldName => {
      // Skip session token if not provided (for Bedrock)
      if (fieldName === 'awsSessionToken' && !details[fieldName]) return null;
      
      const key = formatter.formatKey(fieldName);
      const value = generateHighlightedValue(details[fieldName], fieldName);
      return formatter.template(key, formatter.separator, value);
    })
    .filter(Boolean)
    .join(formatter.joinWith);

  return formatter.prefix + configLines;
}


function getTestRequestCodeBlock(language, vars) {
  switch (language) {
    case 'nodejs':
      return `
<span class="hljs-keyword">import</span> Portkey <span class="hljs-keyword">from</span> <span class="hljs-string">'portkey-ai'</span>

<span class="hljs-keyword">const</span> portkey = <span class="hljs-keyword">new</span> Portkey({
  <span class="hljs-attr">provider</span>: <span class="hljs-string">"<span class="highlighted-value ${vars.provider ? 'filled' : 'empty'}" id="providerValue">${vars.provider || '[Click to edit]'}</span>"</span>${vars.provider != 'bedrock' ? `,
  <span class="hljs-attr">Authorization</span>: <span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.apiKey ? 'filled' : 'empty'}" id="apiKeyValue">${vars.providerDetails?.apiKey || '[Click to edit]'}</span>"</span>`: ''}${vars.provider === 'azure-openai' ? `${generateConfig('azure', 'node', vars)}` : ''}${vars.provider === 'bedrock' ? `${generateConfig('bedrock', 'node', vars)}` : ''}
})

<span class="hljs-comment">// Example: Send a chat completion request</span>
const response = <span class="hljs-keyword">await</span> portkey.chat.completions.<span class="hljs-title function_">create</span>({
  <span class="hljs-attr">messages</span>: [{ <span class="hljs-attr">role</span>: <span class="hljs-string">'user'</span>, <span class="hljs-attr">content</span>: <span class="hljs-string">'Hello, how are you?'</span> }],
  <span class="hljs-attr">model</span>: <span class="hljs-string">"${modelMap[vars.provider] || ''}"</span>${vars.provider=="anthropic"?`,
  <span class="hljs-attr">max_tokens</span>: <span class="hljs-number">40</span>`:''}
})
<span class="hljs-built_in">console</span>.<span class="hljs-title function_">log</span>(response.choices[<span class="hljs-number">0</span>].message.content)`.trim();

    case 'python':
      return `
<span class="hljs-keyword">from</span> portkey_ai <span class="hljs-keyword">import</span> Portkey

client = Portkey(
    <span class="hljs-attr">provider</span>=<span class="hljs-string">"<span class="highlighted-value ${vars.provider ? 'filled' : 'empty'}" id="providerValue">${vars.provider || '[Click to edit]'}</span>"</span>${vars.provider != 'bedrock' ? `,
    <span class="hljs-attr">Authorization</span>=<span class="hljs-string">"<span class="highlighted-value ${vars.providerDetails?.apiKey ? 'filled' : 'empty'}" id="apiKeyValue">${vars.providerDetails?.apiKey || '[Click to edit]'}</span>"</span>`: ''}${vars.provider === 'azure-openai' ? `${generateConfig('azure', 'python', vars)}` : ''}${vars.provider === 'bedrock' ? `${generateConfig('bedrock', 'python', vars)}` : ''}
)

<span class="hljs-comment"># Example: Send a chat completion request</span>
response = client.chat.completions.create(
    messages=[{<span class="hljs-string">"role"</span>: <span class="hljs-string">"user"</span>, <span class="hljs-string">"content"</span>: <span class="hljs-string">"Hello, how are you?"</span>}],
    model=<span class="hljs-string">"${modelMap[vars.provider] || ''}"</span>
)
<span class="hljs-built_in">print</span>(response.choices[<span class="hljs-number">0</span>].message.content)`.trim();

    case 'curl':
      return `curl -X POST \\
https://api.portkey.ai/v1/chat/completions \\
-H <span class="hljs-string">"Content-Type: application/json"</span> \\
-H <span class="hljs-string">"x-portkey-provider: <span class="highlighted-value ${vars.provider ? 'filled' : 'empty'}" id="providerValue">${vars.provider || '[Click to edit]'}</span>"</span> \\${vars.provider != 'bedrock' ? `
-H <span class="hljs-string">"Authorization: <span class="highlighted-value ${vars.providerDetails?.apiKey ? 'filled' : 'empty'}" id="apiKeyValue">${vars.providerDetails?.apiKey || '[Click to edit]'}</span>"</span> \\`: '' }${vars.provider === 'azure-openai' ? `${generateConfig('azure', 'curl', vars)}` : ''}${vars.provider === 'bedrock' ? `${generateConfig('bedrock', 'curl', vars)}` : ''}
<span class="hljs-string">-d '{
  "messages": [
      { "role": "user", "content": "Hello, how are you?" },
  ],
  "model": "<span class="hljs-string">"${modelMap[vars.provider] || ''}"</span>"
}'</span>`.trim();
  }
}


function getRoutingConfigCodeBlock(language, type) {
  return configs[language][type];
}

// Needed for highlight.js
const lngMap = {"nodejs": "js", "python": "py", "curl": "sh"}

// Initialize Lucide icons
lucide.createIcons();

// Variables
let provider = '';
let apiKey = '';
let providerDetails = {};
let logCounter = 0;

// DOM Elements
const providerValue = document.getElementById('providerValue');
const apiKeyValue = document.getElementById('apiKeyValue');
const copyBtn = document.getElementById('copyBtn');
const testRequestBtn = document.getElementById('testRequestBtn');
const logsContent = document.getElementById('logsContent');
const providerDialog = document.getElementById('providerDialog');
const apiKeyDialog = document.getElementById('apiKeyDialog');
const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const saveApiDetailsBtn = document.getElementById('saveApiDetailsBtn');
const languageSelect = document.getElementById('languageSelect');
const copyConfigBtn = document.getElementById('copyConfigBtn');

const camelToSnakeCase = str => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const camelToKebabCase = str => str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

// Dummy function for test request
function dummyTestRequest() {
    // Make an API request to the Portkey API
    // Use the provider and providerDetails to make the request
    const myHeaders = new Headers();
    Object.keys(providerDetails).forEach(key => {
      if (key === 'apiKey') { 
        myHeaders.append("Authorization", providerDetails[key]);
      } else { 
        myHeaders.append("x-portkey-" + camelToKebabCase(key), providerDetails[key]);
      }
    })
    myHeaders.append("Content-Type", "application/json");
    myHeaders.append("x-portkey-provider", provider);

    const raw = JSON.stringify({
      "messages": [{"role": "user","content": "How are you?"}],
      "model": modelMap[provider],
      "max_tokens": 40
    });

    const requestOptions = {method: "POST", headers: myHeaders, body: raw};

    // Add loading class to testRequestBtn
    testRequestBtn.classList.add('loading');

    fetch("/v1/chat/completions", requestOptions)
      .then((response) => {
        if (!response.ok) {
          return response.json().then(error => {
            const responseDiv = document.getElementById('testRequestResponse');
            responseDiv.innerHTML = `<span class="error">[${response.status} ${response.statusText}]</span>: ${error.message || error.error.message}`;
            responseDiv.style.display = 'block';
            throw new Error(error);
          });
        }
        return response.json();
      })
      .then((result) => {
        const responseDiv = document.getElementById('testRequestResponse');
        responseDiv.innerHTML = `${result.choices[0].message.content}`;
        responseDiv.style.display = 'block';
        responseDiv.classList.remove('error');
      })
      .catch((error) => {
        console.error('Error:', error);
      })
      .finally(() => {
        // Remove loading class from testRequestBtn
        testRequestBtn.classList.remove('loading');
      });
}

// Functions

function switchTab(tabsContainer, tabName, updateRoutingConfigFlag = true) {
  const tabs = tabsContainer.querySelectorAll('.tab');
  const tabContents = tabsContainer.closest('.card').querySelectorAll('.tab-content');
  
  tabs.forEach(tab => tab.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));
  
  tabsContainer.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  tabsContainer.closest('.card').querySelector(`#${tabName}Content`).classList.add('active');

  if (tabsContainer.classList.contains('test-request-tabs')) {
      updateAllCommands();
      // Update the language select with the active tab
      languageSelect.value = tabName;
      updateRoutingConfigFlag ? updateRoutingConfig() : null;
  } else if (tabsContainer.classList.contains('routing-config-tabs')) {
      updateRoutingConfig();
  }
}

function updateAllCommands() {
  ["nodejs", "python", "curl"].forEach(language => {
    const command = document.getElementById(`${language}Command`);
    const code = getTestRequestCodeBlock(language, {provider, providerDetails});
    command.innerHTML = code;
    if (provider) {
      const docsLink = document.querySelector('.docs-link');
      docsLink.innerHTML = `<a href="${docsMap[provider] || 'https://portkey.ai/docs/integrations/llms'}" target="_blank">View detailed docs for <b>${provider == "others" ? "all providers" : provider}</b> <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`;
      docsLink.style.display = 'inline-block';
    }
  });
  addClickListeners();
}

function highlightElement(element) {
    element.classList.add('animate-highlight');
    setTimeout(() => element.classList.remove('animate-highlight'), 1000);
}

function showProviderDialog() {
    providerDialog.style.display = 'flex';
}

function getProviderFields(provider) {
  switch(provider) {
      case 'openai':
      case 'anthropic':
      case 'groq':
          return [{ id: 'apiKey', placeholder: 'Enter your API key' }];
      case 'azure-openai':
          return [
              { id: 'apiKey', placeholder: 'Enter your API key' },
              { id: 'azureResourceName', placeholder: 'Azure Resource Name' },
              { id: 'azureDeploymentId', placeholder: 'Azure Deployment ID' },
              { id: 'azureApiVersion', placeholder: 'Azure API Version' },
              { id: 'azureModelName', placeholder: 'Azure Model Name' }
          ];
      case 'bedrock':
          return [
              { id: 'awsAccessKeyId', placeholder: 'AWS Access Key ID' },
              { id: 'awsSecretAccessKey', placeholder: 'AWS Secret Access Key' },
              { id: 'awsRegion', placeholder: 'AWS Region' },
              { id: 'awsSessionToken', placeholder: 'AWS Session Token (optional)' }
          ];
      default:
          return [{ id: 'apiKey', placeholder: 'Enter your API key' }];
  }
}

function showApiKeyDialog() {
    // apiKeyDialog.style.display = 'flex';
    const form = document.getElementById('apiDetailsForm');
    form.innerHTML = ''; // Clear existing fields

    const fields = getProviderFields(provider);
    fields.forEach(field => {
        const label = document.createElement('label');
        label.textContent = field.placeholder;
        label.for = field.id;
        form.appendChild(label);
        const input = document.createElement('input');
        // input.type = 'password';
        input.id = field.id;
        input.className = 'input';
        // input.placeholder = field.placeholder;
        input.value = providerDetails[field.id] || "";
        form.appendChild(input);
    });

    apiKeyDialog.style.display = 'flex';
}

function updateRoutingConfig() {
    const language = languageSelect.value;
    const activeTab = document.querySelector('.routing-config-tabs .tab.active').dataset.tab;
    const codeElement = document.getElementById(`${activeTab}Code`);

    // Also change the tabs for test request
    switchTab(document.querySelector('.test-request-tabs'), language, false);

    const code = getRoutingConfigCodeBlock(language, activeTab);
    codeElement.innerHTML = hljs.highlight(code, {language: lngMap[language]}).value;
}

function addClickListeners() {
  const providerValueSpans = document.querySelectorAll('.highlighted-value:not(#providerValue)');
  const providerValues = document.querySelectorAll('[id^="providerValue"]');
  // const apiKeyValues = document.querySelectorAll('[id^="apiKeyValue"]');

  providerValues.forEach(el => el.addEventListener('click', showProviderDialog));
  // apiKeyValues.forEach(el => el.addEventListener('click', showApiKeyDialog));
  providerValueSpans.forEach(el => el.addEventListener('click', showApiKeyDialog));
}


// Event Listeners
testRequestBtn.addEventListener('click', dummyTestRequest);

document.querySelectorAll('.tabs').forEach(tabsContainer => {
    tabsContainer.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tabsContainer, tab.dataset.tab));
    });
});

copyBtn.addEventListener('click', () => {
    const activeContent = document.querySelector('.curl-command .tab-content.active code');
    navigator.clipboard.writeText(activeContent.innerText);
    copyBtn.innerHTML = '<i data-lucide="check" class="h-4 w-4"></i>';
    lucide.createIcons();
    setTimeout(() => {
        copyBtn.innerHTML = '<i data-lucide="copy" class="h-4 w-4"></i>';
        lucide.createIcons();
    }, 2000);
    // addLog('Code example copied to clipboard');
});

copyConfigBtn.addEventListener('click', () => {
    const activeContent = document.querySelector('.routing-config .tab-content.active code');
    navigator.clipboard.writeText(activeContent.textContent);
    copyConfigBtn.innerHTML = '<i data-lucide="check" class="h-4 w-4"></i>';
    lucide.createIcons();
    setTimeout(() => {
        copyConfigBtn.innerHTML = '<i data-lucide="copy" class="h-4 w-4"></i>';
        lucide.createIcons();
    }, 2000);
    // addLog('Routing config copied to clipboard');
});

// Modify existing event listeners
providerSelect.addEventListener('change', (e) => {
    provider = e.target.value;
    updateAllCommands();
    providerDialog.style.display = 'none';
    highlightElement(document.getElementById('providerValue'));
    // Find if there are any provider details in localStorage for this provider
    let localDetails = localStorage.getItem(`providerDetails-${provider}`);
    if(localDetails) {
      console.log('Provider details found in localStorage', localDetails);
      providerDetails = JSON.parse(localDetails);
      updateAllCommands();
      highlightElement(document.getElementById('apiKeyValue'));
    }
    // addLog(`Provider set to ${provider}`);
});

saveApiDetailsBtn.addEventListener('click', () => {
    const fields = getProviderFields(provider);
    providerDetails = {};
    fields.forEach(field => {
        const input = document.getElementById(field.id);
        providerDetails[field.id] = input.value;
    });
    // Save all provider details in localStorage for this provider
    localStorage.setItem(`providerDetails-${provider}`, JSON.stringify(providerDetails));
    updateAllCommands();
    apiKeyDialog.style.display = 'none';
    highlightElement(document.getElementById('apiKeyValue'));
});

languageSelect.addEventListener('change', updateRoutingConfig);

// Initialize
updateAllCommands();
updateRoutingConfig();

// Close dialogs when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('dialog-overlay')) {
        e.target.style.display = 'none';
    }
});

// Close dialogs when hitting escape
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        providerDialog.style.display = 'none';
        apiKeyDialog.style.display = 'none';
        logDetailsModal.style.display = 'none';
    }
});

// Tab functionality
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.main-tab-content');

function mainTabFocus(tabName) {
  if(tabName === 'logs') {
    resetLogCounter();
  }
  tabButtons.forEach(btn => btn.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));
      
  document.getElementById(`${tabName}-tab-button`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

tabButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      let tabName = button.getAttribute('data-tab');
      const href = tabName === 'logs' ? '/public/logs' : '/public/';
      history.pushState(null, '', href);
      mainTabFocus(tabName);
    });
});

function managePage() {
  if(window.location.pathname === '/public/logs') {
    mainTabFocus('logs');
  } else {
    mainTabFocus('main');
  }
}

window.addEventListener('popstate', () => {
  managePage()
});

managePage()

// Logs functionality
const logsTableBody = document.getElementById('logsTableBody');
const logDetailsModal = document.getElementById('logDetailsModal');
const logDetailsContent = document.getElementById('logDetailsContent');
const closeModal = document.querySelector('.close');
const clearLogsBtn = document.querySelector('.btn-clear-logs');

// SSE for the logs
let logSource;

function setupLogSource() {
  logSource = new EventSource('/log/stream');

  logSource.addEventListener('connected', (event) => {
    console.log('Connected to log stream', event.data);
  });
  
  logSource.addEventListener('log', (event) => {
    const entry = JSON.parse(event.data);
    console.log('Received log entry', entry);
    addLogEntry(entry.time, entry.method, entry.endpoint, entry.status, entry.duration, entry.requestOptions);
  });
  
  // Handle heartbeat to keep connection alive
  logSource.addEventListener('heartbeat', (event) => {
    console.log('Received heartbeat');
  });
  
  logSource.onerror = (error) => {
    console.error('SSE error (logs):', error);
    reconnectLogSource();
  };
}

function cleanupLogSource() {
  if (logSource) {
    console.log('Closing log stream connection');
    logSource.close();
    logSource = null;
  }
}

function reconnectLogSource() {
  if (logSource) {
      logSource.close();
  }
  console.log('Attempting to reconnect to log stream...');
  setTimeout(() => {
      setupLogSource();
  }, 5000); // Wait 5 seconds before attempting to reconnect
}

setupLogSource();

function addLogEntry(time, method, endpoint, status, duration, requestOptions) {
    const tr = document.createElement('tr');
    tr.classList.add('new-row');
    tr.innerHTML = `
        <td class="log-time">${time}</td>
        <td class="log-method"><span class="log-method-value">${method}</span></td>
        <td class="log-endpoint">${endpoint}</td>
        <td class="log-status"><span class="${status>=200 && status<300 ? 'success' : 'error'}">${status}</span></td>
        <td class="log-duration">${duration}ms</td>
        <td><button class="btn-view-details">View Details</button></td>
    `;
    
    const viewDetailsBtn = tr.querySelector('.btn-view-details');
    viewDetailsBtn.addEventListener('click', () => showLogDetails(time, method, endpoint, status, duration, requestOptions));
    
    if (logsTableBody.children.length > 1) {
        logsTableBody.insertBefore(tr, logsTableBody.children[1]);
    } else {
        logsTableBody.appendChild(tr);
    }

    // Ensure the log table does not exceed 100 rows
    while (logsTableBody.children.length > 100) {
        logsTableBody.removeChild(logsTableBody.lastChild);
    }
    
    // Add a message to the last line of the table
    if (logsTableBody.children.length === 100) {
        let messageRow = logsTableBody.querySelector('.log-message-row');
        if (!messageRow) {
            messageRow = document.createElement('tr');
            messageRow.classList.add('log-message-row');
            const messageCell = document.createElement('td');
            messageCell.colSpan = 6; // Assuming there are 6 columns in the table
            messageCell.textContent = 'Only the latest 100 logs are being shown.';
            messageRow.appendChild(messageCell);
            logsTableBody.appendChild(messageRow);
        }
    }

    incrementLogCounter();

    setTimeout(() => {
      tr.className = '';
    }, 500);
}

function showLogDetails(time, method, endpoint, status, duration, requestOptions) {
    logDetailsContent.innerHTML = `
        <h3>Request Details</h3>
        <p><strong>Time:</strong> ${time}</p>
        <p><strong>Method:</strong> ${method}</p>
        <p><strong>Endpoint:</strong> ${endpoint}</p>
        <p><strong>Status:</strong> ${status}</p>
        <p><strong>Duration:</strong> ${duration}ms</p>
        <p><strong>Request:</strong> <pre>${JSON.stringify(requestOptions[0].requestParams, null, 2)}</pre></p>
        <p><strong>Response:</strong> <pre>${JSON.stringify(requestOptions[0].response, null, 2)}</pre></p>
    `;
    logDetailsModal.style.display = 'block';
}

function incrementLogCounter() {
  if(window.location.pathname != '/public/logs') {
    logCounter++;
    const badge = document.querySelector('header .badge');
    badge.textContent = logCounter;
    badge.style.display = 'inline-block';
  }
}

function resetLogCounter() {
  logCounter = 0;
  const badge = document.querySelector('header .badge');
  badge.textContent = logCounter;
  badge.style.display = 'none';
}

closeModal.addEventListener('click', () => {
    logDetailsModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === logDetailsModal) {
        logDetailsModal.style.display = 'none';
    }
});

// Update event listeners for page unload
window.addEventListener('beforeunload', cleanupLogSource);
window.addEventListener('unload', cleanupLogSource);


window.onload = function() {
  // Run the confetti function only once by storing the state in localStorage
  if(!localStorage.getItem('confettiRun')) {
    setTimeout(() => {  
      confetti();
      localStorage.setItem('confettiRun', 'true');
    }, 1000);
  }
  // confetti({
  //     particleCount: 100,
  //     spread: 70,
  //     origin: { y: 0.6 }
  // });
};
