import { describe, expect, test } from "bun:test";
import {
	codeQualityAgentPrompt,
	contextSectionLabels,
	deepReviewAgentPrompt,
	deepseekHarnessSkillDescription,
	deepseekHarnessThermosWorkflow,
	findingReportContract,
	reviewerEvidenceEnvelope,
	thermoNuclearCodeQualityRubric,
	thermoNuclearReviewRubric,
	thermosWorkflow,
} from "../src/content.ts";
import {
	renderClaudeAgent,
	renderClaudeRunCommand,
	renderClaudeShimCommand,
	renderCodexThermosSkill,
	renderDeepseekHarnessPayload,
	renderDeepseekHarnessSkill,
	renderPackageReadme,
	renderPiAgent,
} from "../src/render.ts";

const reportContractMarker = "protocol: thermos-findings/1";
const verificationContractHeading = "## Finding verification";
const piProviders = ["nico", "gotgenes", "tintinweb"] as const;
const reviewerKinds = ["deep", "quality"] as const;

function countOccurrences(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

function frontmatterKeys(text: string): string[] {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	if (!match) return [];
	return (match[1] ?? "")
		.split("\n")
		.map((line) => line.split(":")[0]?.trim() ?? "")
		.filter((key) => key.length > 0);
}

function frontmatterText(text: string): string {
	return /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
}

describe("renderers", () => {
	test("renders Codex $thermos skill", () => {
		const skill = renderCodexThermosSkill();
		expect(skill).toContain("name: thermos");
		expect(skill).toContain("$thermos");
		expect(skill).toContain(thermosWorkflow);
		expect(skill).toContain("The packaged rubric references are available");
		expect(skill).not.toContain("Before launching review passes");
	});

	test("renders Claude plugin command and shim variants", () => {
		const runCommand = renderClaudeRunCommand();
		const shimCommand = renderClaudeShimCommand();
		expect(runCommand).toContain("Usage: `/thermos:run");
		expect(shimCommand).toContain("Usage: `/thermos ");
		expect(runCommand).toContain(thermosWorkflow);
		expect(shimCommand).toContain(thermosWorkflow);
		expect(runCommand).toContain("thermos:thermo-nuclear-review-subagent");
	});

	test("renders Claude agents", () => {
		expect(renderClaudeAgent("deep")).toContain("name: thermo-nuclear-review-subagent");
		expect(renderClaudeAgent("quality")).toContain("code-judo");
	});

	test("renders Pi provider agents", () => {
		expect(renderPiAgent("deep", "nico")).toContain("systemPromptMode: replace");
		expect(renderPiAgent("quality", "gotgenes")).toContain("max_turns: 20");
		expect(renderPiAgent("quality", "tintinweb")).toContain("tools: read, grep");
	});

	test("gives every Claude reviewer agent exactly one findings contract", () => {
		for (const kind of reviewerKinds) {
			const agent = renderClaudeAgent(kind);
			expect(agent).toContain("thermos-findings/1");
			expect(countOccurrences(agent, reportContractMarker)).toBe(1);
		}
	});

	test("gives every Pi reviewer agent exactly one findings contract", () => {
		for (const provider of piProviders) {
			for (const kind of reviewerKinds) {
				const agent = renderPiAgent(kind, provider);
				expect(agent).toContain("thermos-findings/1");
				expect(countOccurrences(agent, reportContractMarker)).toBe(1);
			}
		}
	});

	test("gives the Codex skill the findings contract and the verification contract", () => {
		const skill = renderCodexThermosSkill();
		expect(skill).toContain("thermos-findings/1");
		expect(countOccurrences(skill, reportContractMarker)).toBe(1);
		expect(skill).toContain(verificationContractHeading);
		expect(countOccurrences(skill, verificationContractHeading)).toBe(1);
	});

	test("gives the Claude command the verification contract and the labeled sections", () => {
		const runCommand = renderClaudeRunCommand();
		expect(runCommand).toContain(verificationContractHeading);
		expect(countOccurrences(runCommand, verificationContractHeading)).toBe(1);
		for (const label of contextSectionLabels) {
			expect(runCommand).toContain(`- \`${label}\``);
		}
		expect(countOccurrences(runCommand, reportContractMarker)).toBe(0);
	});

	test("renders the DeepSeek Harness skill with a DSH only frontmatter", () => {
		const skill = renderDeepseekHarnessSkill();
		expect(frontmatterKeys(skill)).toEqual(["name", "description", "disable-model-invocation"]);
		expect(skill).toContain("name: thermos");
		expect(skill).toContain(`description: ${deepseekHarnessSkillDescription}`);
		expect(skill).toContain("disable-model-invocation: true");
		expect(skill).toContain(deepseekHarnessThermosWorkflow);
		expect(skill).toContain(findingReportContract);
		expect(countOccurrences(skill, reportContractMarker)).toBe(1);
		expect(countOccurrences(skill, "thermos-findings/1")).toBe(1);
	});

	test("keeps the DeepSeek Harness skill free of Claude and Codex subagent keys", () => {
		const skill = renderDeepseekHarnessSkill();
		expect(skill).not.toContain("subagent_type");
		expect(skill).not.toContain("run_in_background");
		for (const ignored of ["allowed-tools:", "model:", "effort:", "tools:"]) {
			expect(frontmatterText(skill)).not.toContain(ignored);
		}
	});

	test("renders the DeepSeek Harness reviewer payloads", () => {
		const deep = renderDeepseekHarnessPayload("deep");
		const quality = renderDeepseekHarnessPayload("quality");

		for (const payload of [deep, quality]) {
			expect(payload.startsWith("---")).toBe(false);
			expect(payload).toContain(reviewerEvidenceEnvelope);
			expect(payload).toContain(findingReportContract);
			expect(countOccurrences(payload, reportContractMarker)).toBe(1);
			expect(countOccurrences(payload, "thermos-findings/1")).toBe(1);
		}

		expect(deep).toContain(deepReviewAgentPrompt);
		expect(deep).toContain(thermoNuclearReviewRubric);
		expect(deep).toContain("# Thermo Nuclear Review");
		expect(deep).not.toContain("# Thermo-Nuclear Code Quality Review");

		expect(quality).toContain(codeQualityAgentPrompt);
		expect(quality).toContain(thermoNuclearCodeQualityRubric);
		expect(quality).toContain("# Thermo-Nuclear Code Quality Review");
		expect(quality).not.toContain("# Thermo Nuclear Review");
	});

	test("orders the DeepSeek Harness payload as envelope, prompt, rubric, contract", () => {
		const deep = renderDeepseekHarnessPayload("deep");
		expect(deep.indexOf(reviewerEvidenceEnvelope)).toBeLessThan(deep.indexOf(deepReviewAgentPrompt));
		expect(deep.indexOf(deepReviewAgentPrompt)).toBeLessThan(deep.indexOf(thermoNuclearReviewRubric));
		expect(deep.indexOf(thermoNuclearReviewRubric)).toBeLessThan(deep.indexOf(findingReportContract));
	});

	test("renders the DeepSeek Harness package README", () => {
		const readme = renderPackageReadme("deepseek-harness");
		expect(readme).toContain("# @thinkscape/deepseek-harness-thermos");
		expect(readme).toContain("deepseek-harness-thermos install");
		expect(readme).toContain("`/thermos`");
	});
});
