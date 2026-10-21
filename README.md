# Agent Thermos

![Pixel-art Thermos logo](./assets/logo.png)

Platform-agnostic Thermos packages for Codex, Claude Code, Pi, and DeepSeek
Harness. Thermos runs two deliberately different review passes on the same
branch: one focused on correctness, security, breakages, devex regressions, and
feature-gate leaks; the other focused on strict code quality, maintainability,
structure, abstraction boundaries, and "code-judo" simplification opportunities.

This project is inspired by Cursor's original MIT-licensed
[Thermos plugin](https://github.com/cursor/plugins/tree/main/thermos). The
architecture, methodology, and examples below intentionally preserve the value
proposition of the upstream plugin while adapting it to multiple agent hosts.

## Packages

Choose the package for your agent host. Each package README is written for
installing the published plugin or extension, not for working from a local clone.

| Host | Package README | Registry entries | Primary invocation |
|:--|:--|:--|:--|
| OpenAI Codex | [`@thinkscape/codex-thermos`](./packages/codex-thermos/README.md) | [Codex marketplace entry](./.agents/plugins/marketplace.json), [npm](https://www.npmjs.com/package/@thinkscape/codex-thermos) | `$thermos` |
| Claude Code | [`@thinkscape/claude-thermos`](./packages/claude-thermos/README.md) | [Claude marketplace entry](./.claude-plugin/marketplace.json), [npm](https://www.npmjs.com/package/@thinkscape/claude-thermos) | `/thermos:run`, or optional `/thermos` shim |
| Pi | [`@thinkscape/pi-thermos`](./packages/pi-thermos/README.md) | [Pi package catalog](https://pi.dev/packages/@thinkscape/pi-thermos), [npm](https://www.npmjs.com/package/@thinkscape/pi-thermos) | `thermos` command in Pi |
| DeepSeek Harness | [`@thinkscape/deepseek-harness-thermos`](./packages/deepseek-harness-thermos/README.md) | [npm](https://www.npmjs.com/package/@thinkscape/deepseek-harness-thermos) | `/thermos` in a DeepSeek Harness session |
| Shared internals | [`@thinkscape/thermos-core`](./packages/core/package.json) | private workspace package | shared prompts, rubrics, templates, and generated package assets |

## Architecture

```mermaid
flowchart TB
  subgraph L2["Orchestrator"]
    TH[thermos]
  end

  subgraph L1["Subagents"]
    SNR[thermo-nuclear-review-subagent]
    SNCQ[thermo-nuclear-code-quality-review-subagent]
  end

  DIFF[git diff + file contents]

  subgraph L0["Rubrics / Skills"]
    TNR[thermo-nuclear-review]
    TNCQ[thermo-nuclear-code-quality-review]
  end

  TH --> SNR
  TH --> SNCQ
  SNR --> TNR
  SNR --> DIFF
  SNCQ --> TNCQ
  SNCQ --> DIFF
```

## Methodology

Thermos works best as a double review:

1. Determine the review scope from a base ref, PR, current branch, or explicit file scope.
2. Gather `git diff <base>...HEAD` and enough changed-file context for reviewers to verify findings.
3. Run both review passes on the same input.
4. Ask each reviewer for prioritized findings with file references and evidence.
5. Synthesize the results, dedupe overlapping issues, and lead with findings.

The deep review pass is strict about correctness and security. It only reports
issues introduced or modified by the branch and is expected to trace related
client/server or cross-package behavior before making a claim.

The code-quality pass is intentionally demanding. It looks for structural
regressions, spaghetti growth, files pushed past healthy size boundaries,
unnecessary wrappers, cast-heavy contracts, and missed opportunities to make the
implementation dramatically simpler.

## Development

```bash
bun install
bun run build
bun run test:ci
```

Useful scripts:

| Script | Purpose |
|:--|:--|
| `bun run build` | Sync the shared skills and versions, render the host artifacts, and validate the generated files. |
| `bun run render:artifacts` | Render the host artifacts and the Pi prompt module from the shared constants. |
| `bun run test` | Run all tests. |
| `bun run test:ci` | Run lint, typecheck, generated-file checks, tests, and package checks. |
| `bun run changeset` | Create a changeset. |
| `bun run version` | Apply changeset versions and changelogs. |
| `bun run release` | Validate and publish packages through Changesets. |

A change to a constant in `packages/core/src/content.ts` is regenerated into the
committed host artifacts by `bun run build`; `bun run test:ci` only validates
them.

## Release Automation

Pull requests and pushes to `main` run the Bun CI workflow. Merges to `main`
also run Changesets release automation. When changesets exist, the release
workflow opens or updates a version PR. When the version PR lands, it publishes
the public packages to npm using `NPM_TOKEN`.

## Attribution

This repository adapts documentation, methodology, and prompt structure from
Cursor's Thermos plugin, which is distributed under the MIT License. See
[NOTICE.md](./NOTICE.md) for the upstream copyright notice.

## License

MIT
