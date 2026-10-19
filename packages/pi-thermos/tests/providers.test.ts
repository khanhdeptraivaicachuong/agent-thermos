import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { reviewerTaskHead, thermosWorkflow } from "../src/generated/prompts.ts";
import thermosExtension, { buildThermosPayload, buildThermosPrompt, detectPiSubagentsProvider } from "../src/index.ts";

const root = resolve(import.meta.dir, "..");

describe("@thinkscape/pi-thermos provider detection", () => {
	test("detects package markers", () => {
		expect(detectPiSubagentsProvider({ packages: { "pi-subagents": true } }).provider).toBe("nico");
		expect(detectPiSubagentsProvider({ packages: { "@gotgenes/pi-subagents": true } }).provider).toBe("gotgenes");
		expect(detectPiSubagentsProvider({ packages: { "@tintinweb/pi-subagents": true } }).provider).toBe("tintinweb");
	});

	test("detects tool schemas", () => {
		expect(
			detectPiSubagentsProvider({
				tools: [{ name: "subagent", inputSchema: { properties: { tasks: {}, chain: {} } } }],
			}).provider,
		).toBe("nico");
		expect(
			detectPiSubagentsProvider({
				tools: [{ name: "subagent", inputSchema: { properties: { subagent_type: {}, prompt: {} } } }],
			}).provider,
		).toBe("gotgenes");
		expect(
			detectPiSubagentsProvider({
				tools: [{ name: "Agent", inputSchema: { properties: { subagent_type: {}, prompt: {} } } }],
			}).provider,
		).toBe("tintinweb");
	});

	test("builds dry-run payloads", () => {
		expect(buildThermosPayload("nico", "main").calls[0]?.args).toHaveProperty("tasks");
		expect(buildThermosPayload("gotgenes", "main").calls[0]?.tool).toBe("subagent");
		expect(buildThermosPayload("tintinweb", "main").calls[0]?.tool).toBe("Agent");
		expect(JSON.stringify(buildThermosPayload("tintinweb", "main").calls)).toContain("### Git / diff output");
		expect(JSON.stringify(buildThermosPayload("tintinweb", "main").calls)).toContain("### Changed file contents");
		expect(buildThermosPayload("tintinweb", "main").calls[0]?.args.prompt).toContain(reviewerTaskHead);
	});

	test("registers a valid Pi slash command and submits a provider-aware prompt", async () => {
		let registered:
			| {
					name: string;
					command: {
						description?: string;
						argumentHint?: string;
						handler: (args?: string) => Promise<void> | void;
					};
			  }
			| undefined;
		const messages: string[] = [];

		thermosExtension({
			getAllTools: () => [{ name: "subagent", parameters: { properties: { tasks: {}, chain: {} } } }],
			registerCommand: (name, command) => {
				registered = { name, command };
			},
			sendUserMessage: (content) => {
				messages.push(content);
			},
		});

		expect(registered?.name).toBe("thermos");
		expect(registered?.command.description).toContain("code-quality reviews");
		expect(registered?.command.argumentHint).toBe("[base-ref | PR URL | scope]");

		await registered?.command.handler("main");

		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain("Use the nico Pi subagent provider");
		expect(messages[0]).toContain("Run the two thermo review passes as async background subagents in parallel");
		expect(messages[0]).toContain("Launch both subagents in the same message with `run_in_background: true`");
		expect(messages[0]).toContain('"thermo-nuclear-review-subagent"');
	});

	test("renders Thermos prompts without exposing package skills", () => {
		const prompt = buildThermosPrompt("gotgenes", "current branch");
		expect(prompt).toContain("Call `subagent` with");
		expect(prompt).toContain("## Workflow");
		expect(prompt).toContain("## Pi Provider Calls");
		expect(prompt).toContain("replacing the placeholder sections");
		expect(prompt).toContain("Weight overlapping findings more heavily");
		expect(prompt).toContain("### Git / diff output");
		expect(prompt).toContain("### Changed file contents");
		expect(prompt).toContain("thermo-nuclear-code-quality-review-subagent");
		expect(prompt).toContain(thermosWorkflow);
		expect(existsSync(join(root, "skills"))).toBe(false);
	});

	test("installs project agents without API keys", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-thermos-"));
		try {
			const result = Bun.spawnSync({
				cmd: [
					"node",
					join(root, "bin/pi-thermos.js"),
					"install-agents",
					"--scope",
					"project",
					"--provider",
					"gotgenes",
					"--cwd",
					dir,
				],
				stdout: "pipe",
				stderr: "pipe",
			});
			expect(result.exitCode).toBe(0);
			const agent = readFileSync(join(dir, ".pi/agents/thermo-nuclear-review-subagent.md"), "utf8");
			expect(agent).toContain("max_turns: 20");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("rejects install-agents options without values before writing", () => {
		for (const args of [["--cwd"], ["--scope"], ["--provider"], ["--provider", "--dry-run"]]) {
			const dir = mkdtempSync(join(tmpdir(), "pi-thermos-invalid-"));
			try {
				const result = Bun.spawnSync({
					cmd: ["node", join(root, "bin/pi-thermos.js"), "install-agents", ...args],
					cwd: dir,
					stdout: "pipe",
					stderr: "pipe",
				});
				expect(result.exitCode).not.toBe(0);
				expect(existsSync(join(dir, ".pi"))).toBe(false);
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		}
	});
});
