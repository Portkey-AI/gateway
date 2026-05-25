# ATR (Agent Threat Rules) Plugin

This plugin runs request or response content through a list of ATR (Agent Threat Rules) detection rules and blocks when a match meets or exceeds the configured severity threshold.

## Overview

ATR is an MIT-licensed open detection rule format for AI agent security threats. Rules describe attacks such as prompt injection, system-prompt exfiltration, tool-output poisoning, IMDS/SSRF probing, and known agent-framework CVE patterns. The format is independent of any single vendor, runtime or agent framework.

Project repository: https://github.com/Agent-Threat-Rule/agent-threat-rules

## Features

- Inline rule definition: pass the rules array directly via plugin parameters
- Severity threshold: block on `low`, `medium`, `high` or `critical` and above
- Reports both blocking matches and below-threshold matches in `data`
- Pure JavaScript regex evaluation, no outbound network call in the hot path
- Invalid regex in a single rule is skipped, not fatal to the scan

## Setup

There are no credentials. The plugin runs entirely with the rules provided in the request configuration.

For production use, pin to a specific ATR release by importing the `agent-threat-rules` package and passing the resulting rule list into the `rules` parameter at config-construction time.

## Usage

### Basic configuration

```yaml
plugins:
  - name: atr
    config:
      severity_threshold: high
      rules:
        - id: ATR-2026-00440
          severity: high
          regex: 'ignore (all|previous) instructions'
        - id: ATR-2026-00050
          severity: critical
          regex: '169\.254\.169\.254'
```

### Hook selection

The plugin is registered for both `beforeRequestHook` and `afterRequestHook`. Use the request hook to block injection prompts before they reach the model, and the response hook to catch model output that exfiltrates a system prompt or relays tool poisoning back to the caller.

## Response data

When the verdict is `false`, `data` contains:

```json
{
  "matched_rules": ["ATR-2026-00440"],
  "below_threshold": [],
  "reason": "ATR rules matched at or above severity threshold"
}
```

When the verdict is `true` and at least one below-threshold rule matched:

```json
{
  "matched_rules": [],
  "below_threshold": ["ATR-2026-00050"]
}
```

## Severity ordering

`low` < `medium` < `high` < `critical`. The default threshold is `high`.

## License

The plugin code in this directory is contributed under the same license as the host repository. ATR itself is MIT licensed.
