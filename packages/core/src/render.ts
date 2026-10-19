import {
	architectureDiagram,
	codeQualityAgentPrompt,
	commandDescription,
	contextSectionLabels,
	deepReviewAgentPrompt,
	findingReportContract,
	sharedReadmeMethodology,
	thermoNuclearCodeQualityRubric,
	thermoNuclearReviewRubric,
	thermosShortDescription,
	thermosWorkflow,
	upstreamCredit,
	usageArgumentHint,
} from "./content.ts";

export function renderCodexThermosSkill(): string {
	return `---
name: thermos
description: "Launch both thermo-nuclear review subagents in parallel, then synthesize their findings. Use for $thermos, thermos, double thermo review, or combined bug/security and code-quality branch audits."
disable-model-invocation: true
---

# Thermos

Explicit invocation: \`$thermos ${usageArgumentHint}\`

${thermosWorkflow}

## Codex Notes

Use Codex subagents or multi-agent tools when available. If the current Codex surface does not expose background subagents, run the two passes sequentially in the main thread and keep the outputs clearly separated before synthesis.

The packaged rubric references are available at \`references/thermo-nuclear-review.md\` and \`references/thermo-nuclear-code-quality-review.md\`. Give each subagent the matching rubric if the host does not automatically resolve the named subagent.

Give each pass the finding report contract below verbatim, so both passes return the same findings block.

${findingReportContract}
`;
}

export function renderClaudeRunCommand({ shim = false } = {}): string {
	const invocation = shim ? "/thermos" : "/thermos:run";
	const agentPrefix = "thermos:";
	return `---
description: ${commandDescription}
argument-hint: ${usageArgumentHint}
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git show:*), Bash(git rev-parse:*), Bash(gh pr view:*), Bash(glab mr view:*)
---

# Thermos

Usage: \`${invocation} ${usageArgumentHint}\`

${thermosWorkflow}

## Claude Notes

If no scope is provided, review the current branch against \`main\`. Use the plugin-scoped Claude agent names \`${agentPrefix}thermo-nuclear-review-subagent\` and \`${agentPrefix}thermo-nuclear-code-quality-review-subagent\` for the matching upstream \`subagent_type\` values.

Pass both agents the same labeled context sections:
${contextSectionLabels.map((label) => `- \`${label}\``).join("\n")}

If the plugin-scoped agents are unavailable, run the same two review passes with general-purpose subagents, and give each of them the rubric and the finding report contract from the matching agent definition in this plugin.
`;
}

export function renderClaudeShimCommand(): string {
	return renderClaudeRunCommand({ shim: true });
}

export function renderClaudeAgent(kind: "deep" | "quality"): string {
	if (kind === "deep") {
		return `---
name: thermo-nuclear-review-subagent
description: Thermo-nuclear branch audit for bugs, breaking changes, security, devex, and feature-gate leaks scoped to the diff.
model: sonnet
effort: high
tools: Read, Grep, Glob, Bash
---

${deepReviewAgentPrompt}

${thermoNuclearReviewRubric}

${findingReportContract}
`;
	}

	return `---
name: thermo-nuclear-code-quality-review-subagent
description: Thermo-nuclear code-quality audit for maintainability, structure, 1k-line rule, spaghetti growth, and code-judo simplification.
model: sonnet
effort: high
tools: Read, Grep, Glob, Bash
---

${codeQualityAgentPrompt}

${thermoNuclearCodeQualityRubric}

${findingReportContract}
`;
}

export function renderPiAgent(kind: "deep" | "quality", provider: "nico" | "gotgenes" | "tintinweb"): string {
	const name = kind === "deep" ? "thermo-nuclear-review-subagent" : "thermo-nuclear-code-quality-review-subagent";
	const description =
		kind === "deep"
			? "Thermo-nuclear branch audit for bugs, breaking changes, security, devex, and feature-gate leaks scoped to the diff."
			: "Thermo-nuclear code-quality audit for maintainability, structure, 1k-line rule, spaghetti growth, and code-judo simplification.";
	const body =
		kind === "deep"
			? `${deepReviewAgentPrompt}\n\n${thermoNuclearReviewRubric}\n\n${findingReportContract}`
			: `${codeQualityAgentPrompt}\n\n${thermoNuclearCodeQualityRubric}\n\n${findingReportContract}`;

	if (provider === "nico") {
		return `---
name: ${name}
description: ${description}
tools: read, grep, find, ls, bash
thinking: high
systemPromptMode: replace
inheritProjectContext: true
inheritSkills: false
---

${body}
`;
	}

	return `---
description: ${description}
tools: read, grep, find, bash, ls
thinking: high
max_turns: 20
---

${body}
`;
}

export function renderPackageReadme(host: "codex" | "claude" | "pi"): string {
	const title =
		host === "codex"
			? "@thinkscape/codex-thermos"
			: host === "claude"
				? "@thinkscape/claude-thermos"
				: "@thinkscape/pi-thermos";
	const command =
		host === "codex"
			? "$thermos"
			: host === "claude"
				? "/thermos:run, or /thermos after installing the shim"
				: "pi-thermos provider orchestration";
	return `# ${title}

![Pixel-art Thermos logo](./assets/logo.png)

${thermosShortDescription}

${upstreamCredit}

## Install

${
	host === "codex"
		? "Install with `codex plugin marketplace add Thinkscape/agent-thermos`, then `codex plugin add thermos@agent-thermos`."
		: ""
}
${
	host === "claude"
		? "Install with `claude plugin marketplace add Thinkscape/agent-thermos`, then `claude plugin install thermos@agent-thermos`."
		: ""
}
${host === "pi" ? "Install with `pi install npm:@thinkscape/pi-thermos`." : ""}

## Primary invocation

\`${command}\`

## Architecture

${architectureDiagram}

## Methodology

${sharedReadmeMethodology}

## Typical usage

1. Review the current branch against \`main\`.
2. Gather the diff and changed-file context.
3. Run both Thermos review passes.
4. Synthesize prioritized, deduped findings.

## Attribution

This package adapts methodology and documentation from Cursor's MIT-licensed Thermos plugin. See the repository NOTICE for the upstream copyright notice.
`;
}
