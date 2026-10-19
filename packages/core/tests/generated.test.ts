import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { piPromptsModulePath, renderPiPromptsModule } from "../../../scripts/render-artifacts.ts";
import {
	contextSectionLabels as generatedContextSectionLabels,
	reviewerTaskHead as generatedReviewerTaskHead,
	thermosWorkflow as generatedThermosWorkflow,
} from "../../pi-thermos/src/generated/prompts.ts";
import { contextSectionLabels, reviewerTaskHead, thermosWorkflow } from "../src/content.ts";
import {
	renderClaudeAgent,
	renderClaudeRunCommand,
	renderClaudeShimCommand,
	renderCodexThermosSkill,
	renderPiAgent,
} from "../src/render.ts";

const root = resolve(import.meta.dir, "../../..");
const piProviders = ["nico", "gotgenes", "tintinweb"] as const;
const agentFiles = [
	["deep", "thermo-nuclear-review-subagent.md"],
	["quality", "thermo-nuclear-code-quality-review-subagent.md"],
] as const;
const sharedSkills = ["thermo-nuclear-review", "thermo-nuclear-code-quality-review"] as const;

function read(path: string): string {
	return readFileSync(join(root, path), "utf8");
}

function normalize(text: string): string {
	return text.replace(/\r\n/g, "\n").trimEnd();
}

function expectGeneratedFile(path: string, expected: string) {
	expect(normalize(read(path))).toBe(normalize(expected));
}

function packageVersion(path: string): string {
	const pkg = JSON.parse(read(path)) as { version: string };
	return pkg.version;
}

describe("generated package files", () => {
	test("Codex package exposes thermos plugin and $thermos skill", () => {
		const manifest = JSON.parse(read("packages/codex-thermos/.codex-plugin/plugin.json")) as {
			name: string;
			version: string;
			interface: { displayName: string; logo: string };
		};
		expect(manifest.name).toBe("thermos");
		expect(manifest.version).toBe(packageVersion("packages/codex-thermos/package.json"));
		expect(manifest.interface.displayName).toBe("Thermos");
		expect(manifest.interface.logo).toBe("./assets/logo.png");
		expectGeneratedFile("packages/codex-thermos/skills/thermos/SKILL.md", renderCodexThermosSkill());
		expect(existsSync(join(root, "packages/codex-thermos/skills/thermo-nuclear-review"))).toBe(false);
		expect(existsSync(join(root, "packages/codex-thermos/skills/thermo-nuclear-code-quality-review"))).toBe(false);
	});

	test("Claude package exposes thermos plugin, run command, and agents", () => {
		const manifest = JSON.parse(read("packages/claude-thermos/.claude-plugin/plugin.json")) as {
			name: string;
			version: string;
			commands: string[];
			agents: string[];
			skills?: string;
		};
		expect(manifest.name).toBe("thermos");
		expect(manifest.version).toBe(packageVersion("packages/claude-thermos/package.json"));
		expect(manifest.commands).toContain("./commands/run.md");
		expect(manifest.skills).toBeUndefined();
		expect(manifest.agents).toContain("./agents/thermo-nuclear-review-subagent.md");
		expect(manifest.agents).toContain("./agents/thermo-nuclear-code-quality-review-subagent.md");
		expectGeneratedFile("packages/claude-thermos/commands/run.md", renderClaudeRunCommand());
		expectGeneratedFile("packages/claude-thermos/shims/thermos.md", renderClaudeShimCommand());
		expectGeneratedFile("packages/claude-thermos/agents/thermo-nuclear-review-subagent.md", renderClaudeAgent("deep"));
		expectGeneratedFile(
			"packages/claude-thermos/agents/thermo-nuclear-code-quality-review-subagent.md",
			renderClaudeAgent("quality"),
		);
		expect(existsSync(join(root, "packages/claude-thermos/commands/thermos.md"))).toBe(false);
		expect(existsSync(join(root, "packages/claude-thermos/skills"))).toBe(false);
	});

	test("Pi package includes generated provider agent templates", () => {
		for (const provider of piProviders) {
			for (const [kind, file] of agentFiles) {
				expectGeneratedFile(`packages/pi-thermos/agents/${provider}/${file}`, renderPiAgent(kind, provider));
			}
		}
	});

	test("Pi prompt module matches the rendered generator output", () => {
		expectGeneratedFile(piPromptsModulePath, renderPiPromptsModule());
	});

	test("Pi prompt module carries the core prompt constants", () => {
		expect(generatedThermosWorkflow).toBe(thermosWorkflow);
		expect(generatedReviewerTaskHead).toBe(reviewerTaskHead);
		expect(generatedContextSectionLabels).toEqual([...contextSectionLabels]);
	});

	test("Pi package sources read the prompts from the generated module", () => {
		const indexSource = read("packages/pi-thermos/src/index.ts");
		const providersSource = read("packages/pi-thermos/src/providers.ts");

		expect(indexSource).toContain('from "./generated/prompts.ts"');
		expect(indexSource).not.toContain("Determine the review scope from the user request");
		expect(indexSource).not.toContain("### Git / diff output");

		expect(providersSource).toContain('from "./generated/prompts.ts"');
		expect(providersSource).not.toContain("### Git / diff output");
	});

	test("host packages copy shared rubric content from core", () => {
		for (const skill of sharedSkills) {
			const expected = read(`packages/core/skills/${skill}/SKILL.md`);
			expectGeneratedFile(`packages/codex-thermos/skills/thermos/references/${skill}.md`, expected);
		}
		expect(existsSync(join(root, "packages/pi-thermos/skills"))).toBe(false);
	});

	test("asset references point to committed files", () => {
		for (const dir of [
			"assets",
			"packages/codex-thermos/assets",
			"packages/claude-thermos/assets",
			"packages/pi-thermos/assets",
		]) {
			expect(existsSync(join(root, dir, "logo.png"))).toBe(true);
			expect(existsSync(join(root, dir, "icon.png"))).toBe(true);
		}
	});
});
