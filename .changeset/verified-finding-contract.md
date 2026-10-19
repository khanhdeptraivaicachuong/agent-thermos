---
"@thinkscape/claude-thermos": patch
"@thinkscape/codex-thermos": patch
"@thinkscape/pi-thermos": patch
---

Make the Thermos finding contract machine-checkable in the Claude, Codex and Pi reviewer prompts: each pass now ends its reply with one `thermos-findings/1` block, and the parent verifies every card against the changed lines before it reports a finding.
