# Portkey Product Features Comparison

### At Portkey, we are building a Control Panel for Gen AI apps

We do **5 things** to help you control your in-production app:
1. **Observability**
    * Setup instant monitoring, tracing, feedback loops, and alerts for all of your LLM calls - to help easily debug issues, find usage patterns, and areas of improvement
3. **AI Gateway**
    * Use not just OpenAI but 100+ other LLMs (open source & closed) without changing production code - to help you reduce dependance on one provider and experiment faster with new LLMs
    * Set up fallbacks, loadbalancing, retries, caching, request timeouts, rate limiting, and more for your LLM app - to make your app more reliable, robust, and cost-efficient
3. **Prompt Management**
    * Manage all your prompts, variables, and their various versions in one place with advanced publishing controls - to ship your prompts directly to production without making any changes to production
4. **Guardrails**
   * ...
5. **Security & Compliance**
   * Mask provider keys, setup access control & inbound rules, and redact sensitive data - to ensure enterprisse-grade privacy & security, and compliance with SOC2, ISO, HIPAA, GDPR standards.

Portkey processes **billions** of tokens everyday for our customers worldwide. All these requests are routed through our AI Gateway. We've open sourced this core AI Gateway that we use internally, to the community. 

While Portkey itself has a generous free tier (1k requests free / month), if you are considering to use the open source Gateway in your projects instead, here's a handy guide illustrating the key differences between [Portkey's hosted app](https://app.portkey.ai/) and the open source Gateway that powers it:

| Product | Feature | Open Source <br>(Host Locally) | Hosted <br>(Free) | Hosted <br>($100/Month) | Enterprise <br>(On-Prem) |
| - | - | - | - | - | - |
| Requests per Month |  | No Limit | 1K <br>+ $19/Month for every 100K | 1M/Month | No Limit |
| **Observability** | | | |
| | Logs | ❌ | ✅ <br>Up to 3 Days | ✅ <br>Up to 30 Days | ✅ |
| | Traces | ❌ | ✅  <br>Up to 3 Days | ✅ <br>Up to 30 Days | ✅ |
| | Feedback | ❌ | ✅  | ✅ | ✅ |
| | Custom Metadata | ❌ | ✅  | ✅ | ✅ |
| | Filters | ❌ | ✅  | ✅ | ✅ |
| **AI Gateway** | | | |
| | Universal API | ✅ | ✅  | ✅ | ✅ |
| | Automatic Fallbacks | ✅ | ✅  | ✅ | ✅ |
| | Loadbalancing | ✅ | ✅  | ✅ | ✅ |
| | Automatic Retries | ✅ | ✅  | ✅ | ✅ |
| | Request Timeouts | ✅ | ✅  | ✅ | ✅ |
| | Config Management | ❌ | ✅ <br>Up to 1 Config | ✅ | ✅ |
| | Virtual Keys & Key Management | ❌ | ❌ | ✅ | ✅ |
| | Simple Caching | ❌ | ✅ | ✅ | ✅ |
| | Semantic Caching | ❌ | ❌ | ✅ | ✅ |
| **Prompt Management** | | | |
| | Prompt Templates | ❌ | ✅ <br>Up to 3 Templates | ✅ | ✅ |
| | Playground | ❌ | ✅ | ✅ | ✅ |
| | API Deployment | ❌ | ✅ | ✅ | ✅ |
| | Versioning | ❌ | ✅ | ✅ | ✅ |
| | Variable Management | ❌ | ✅  | ✅ | ✅ |
| **Guardrails** | | | |
| | Eval Templates | ❌ | ✅ <br>Up to 1 Eval | ✅ | ✅ |
| **Security & Compliance** | | | |
| | Role Based<br>Access Control | ❌ | ❌ | ✅ | ✅ |
| | PII Anonymizer | ❌ | ❌ | ❌ | ✅ |
| | SOC2, ISO27001,<br>GDPR, HIPAA Compliances | ❌ | ❌ | ✅ | ✅ |
| | BAA Signing<br>for Compliances | ❌ | ❌ | ❌ | ✅ |
| | VPC Managed Hosting | ❌ | ❌ | ❌ | ✅ |
| | Configurable Retention<br>Periods | ❌ | ❌ | ❌ | ✅ |

### Using Open Source
Just do `npx @portkey-ai/gateway` and Portkey Gateway will spin up on your machine, on port `8787`. You can now use the OpenAI SDK directly to call any other LLM, setup fallbacks/retries etc.

### Using Hosted App
You can sign up using your work email [here](https://app.portkey.ai/). To upgrade your account to paid ($100), ping any Portkey team member on [Discord](https://portkey.ai/community)

### Enterprise
Portkey is [enterprise-ready](https://saasboomi.org/postman-postbot-gen-ai-case-study/). [Schedule a call](https://calendly.com/rohit-portkey/enterprise-demo) to discuss how we can help.
