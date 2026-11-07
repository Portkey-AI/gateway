# Postman collection: Portkey MCP Gateway + Obsidian policy

Test the gateway's Obsidian policy enforcement from Postman. See
[OBSIDIAN_POLICY.md](../OBSIDIAN_POLICY.md) for how the integration works and
how to set up Obsidian and the gateway.

## Import

Postman > **Import** > select `portkey-mcp-obsidian.postman_collection.json`.

## Set the collection variables

Open the collection > **Variables** and edit the **Current value** column.

| Variable           | Set it to                                                                    |
| ------------------ | ---------------------------------------------------------------------------- |
| `baseUrl`          | Your gateway, default `http://localhost:8788`                                |
| `workspace`        | The `<workspace>` half of your `servers.json` key (default `demo`)           |
| `server`           | The `<server>` half of the key (default `echo-server`)                       |
| `tool`             | A harmless tool on that server (default `echo`)                              |
| `gatewayTokenName` | The name of your Obsidian **gateway** token                                  |
| `setupToken`       | Your Obsidian **setup** token (secret). Only needed for folder 3             |

Leave `clientId`, `clientSecret`, `token`, `policyId` and `expect` empty or at
their defaults: the collection fills them in.

Use **collection variables**, not an environment: the scripts set the collection
variables, and an environment value of the same name would shadow them.

## Run it

Start the gateway first (see *Quick start* in [OBSIDIAN_POLICY.md](../OBSIDIAN_POLICY.md)), then send the requests in order,
or use the **Collection Runner** to run a whole folder.

1. **Connect to the gateway.** Health, register an OAuth client, get a token,
   initialize, list tools. Run this once; repeat only **Get access token** when
   the token expires (1 hour).
2. **Tool calls.** *MCP: call tool* asserts the outcome matches the `expect`
   variable (`allowed` or `blocked`).
3. **Obsidian policy.** Needs `setupToken`.
   1. *Register the gateway* (once).
   2. *Create test policy (warn)*, then run *MCP: call tool*: allowed.
   3. *Switch test policy to BLOCK*, then run *MCP: call tool* again: the test
      passes only if the call was **blocked** with code `-32003`. These requests
      flip `expect` for you.
   4. *Event log* shows the matching events in Obsidian.
   5. *Delete test policy* when you are done.

If a call right after a policy change still shows the old result, send it again.

## Responses look odd?

MCP responses arrive as server-sent events (`event: message` / `data: {...}`),
so Postman shows them as raw text. The test scripts parse the `data:` line for
you.

## Postman's built-in MCP client

Postman can also connect to MCP servers directly (**New > MCP**). Use the URL
`http://localhost:8788/<workspace>/<server>/mcp` and add the header
`Authorization: Bearer <token>`, where the token comes from the *Get access
token* request. This collection was verified with Postman's CLI runner (Newman),
not by clicking through that client, so treat the UI steps as a starting point.

## Obsidian documentation

Folder 3 calls Obsidian's Realtime Enforcement API. For the authoritative
request formats, tokens and roles, and policy structure, see Obsidian's
documentation at <https://docs.obsidiansecurity.com/> (sign in via your Obsidian
portal): the *Unified Evaluation*, *Realtime Enforcement API* and *API Tokens*
pages.

## Safety

* **Policies apply to every gateway/agent of this type in your Obsidian
  organization.** The test policy matches only the tool in the `tool` variable.
  In a shared organization, point `tool` at something distinctive, and delete the
  policy when you finish.
* The collection deliberately has **no** `PUT /policies` request: that endpoint
  replaces the organization's entire policy set.
* `setupToken` is a secret variable. Do not export the collection with a value
  filled in.
