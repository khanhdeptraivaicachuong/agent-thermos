import { describe, expect, test } from "bun:test";
import { contextSectionLabels, thermosWorkflow } from "../src/content.ts";
import {
	renderClaudeAgent,
	renderClaudeRunCommand,
	renderClaudeShimCommand,
	renderCodexThermosSkill,
	renderPiAgent,
} from "../src/render.ts";

const reportContractMarker = "protocol: thermos-findings/1";
const verificationContractHeading = "## Finding verification";
const piProviders = ["nico", "gotgenes", "tintinweb"] as const;
const reviewerKinds = ["deep", "quality"] as const;

function countOccurrences(text: string, needle: string): number {
	return text.split(needle).length - 1;
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
});
