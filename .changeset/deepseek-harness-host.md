---
"@thinkscape/deepseek-harness-thermos": patch
---

Add the DeepSeek Harness host: `@thinkscape/deepseek-harness-thermos` installs a `thermos` skill that runs both review passes as two parallel `subagent` delegations, verifies every finding card against the changed lines with the bundled validator, and then synthesizes the surviving findings.
