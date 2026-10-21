import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const installer = join(root, "bin/deepseek-harness-thermos.js");
const skillSource = join(root, "skill", "thermos");

function run(args: string[], options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries({ ...process.env, ...options.env })) {
		if (value !== undefined) env[key] = value;
	}
	const result = Bun.spawnSync({
		cmd: ["node", installer, ...args],
		cwd: options.cwd,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

function listFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) {
			files.push(...listFiles(path).map((child) => `${entry}/${child}`));
		} else {
			files.push(entry);
		}
	}
	return files.sort();
}

function snapshot(dir: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const file of listFiles(dir)) {
		result[file] = createHash("sha256")
			.update(readFileSync(join(dir, file)))
			.digest("hex");
	}
	return result;
}

function makeTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

describe("@thinkscape/deepseek-harness-thermos install", () => {
	test("installs the skill into the git root of a project", () => {
		const dir = makeTempDir("dsh-thermos-project-");
		try {
			mkdirSync(join(dir, ".git"));
			const nested = join(dir, "packages", "app");
			mkdirSync(nested, { recursive: true });

			const result = run(["install", "--scope", "project", "--cwd", nested]);
			expect(result.exitCode).toBe(0);

			const installed = join(dir, ".dsh", "skills", "thermos");
			expect(existsSync(join(installed, "SKILL.md"))).toBe(true);
			expect(existsSync(join(installed, "references", "deep-review-payload.md"))).toBe(true);
			expect(existsSync(join(installed, "references", "code-quality-payload.md"))).toBe(true);
			expect(readFileSync(join(installed, "SKILL.md"), "utf8")).toBe(
				readFileSync(join(skillSource, "SKILL.md"), "utf8"),
			);
			expect(result.stdout).toContain(installed);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("copies the whole skill directory, including the validator program", () => {
		const dir = makeTempDir("dsh-thermos-copy-");
		try {
			mkdirSync(join(dir, ".git"));

			const result = run(["install", "--scope", "project", "--cwd", dir]);
			expect(result.exitCode).toBe(0);

			const installed = join(dir, ".dsh", "skills", "thermos");
			expect(listFiles(installed)).toEqual(listFiles(skillSource));
			expect(snapshot(installed)).toEqual(snapshot(skillSource));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("installs into the working directory when there is no git root", () => {
		const dir = makeTempDir("dsh-thermos-nogit-");
		try {
			const result = run(["install", "--scope", "project", "--cwd", dir]);
			expect(result.exitCode).toBe(0);
			expect(existsSync(join(dir, ".dsh", "skills", "thermos", "SKILL.md"))).toBe(true);
			expect(result.stdout).toContain("No .git ancestor found");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("replaces a stale skill directory and a stale flat skill file", () => {
		const dir = makeTempDir("dsh-thermos-stale-");
		try {
			mkdirSync(join(dir, ".git"));
			const skillsDir = join(dir, ".dsh", "skills");
			mkdirSync(join(skillsDir, "thermos"), { recursive: true });
			writeFileSync(join(skillsDir, "thermos", "stale.md"), "stale", "utf8");
			writeFileSync(join(skillsDir, "thermos.md"), "stale", "utf8");

			const result = run(["install", "--scope", "project", "--cwd", dir]);
			expect(result.exitCode).toBe(0);
			expect(existsSync(join(skillsDir, "thermos", "stale.md"))).toBe(false);
			expect(existsSync(join(skillsDir, "thermos.md"))).toBe(false);
			expect(existsSync(join(skillsDir, "thermos", "SKILL.md"))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("writes nothing on a dry run", () => {
		const dir = makeTempDir("dsh-thermos-dry-");
		try {
			mkdirSync(join(dir, ".git"));

			const result = run(["install", "--scope", "project", "--cwd", dir, "--dry-run"]);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Would install");
			expect(existsSync(join(dir, ".dsh"))).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("installing twice leaves identical bytes", () => {
		const dir = makeTempDir("dsh-thermos-twice-");
		try {
			mkdirSync(join(dir, ".git"));

			expect(run(["install", "--scope", "project", "--cwd", dir]).exitCode).toBe(0);
			const installed = join(dir, ".dsh", "skills", "thermos");
			const first = snapshot(installed);

			expect(run(["install", "--scope", "project", "--cwd", dir]).exitCode).toBe(0);
			expect(snapshot(installed)).toEqual(first);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("installs into the DSH home for the user scope", () => {
		const dir = makeTempDir("dsh-thermos-user-");
		try {
			const home = join(dir, "dsh-home");
			mkdirSync(home, { recursive: true });

			const result = run(["install", "--scope", "user"], { env: { DSH_HOME: home } });
			expect(result.exitCode).toBe(0);
			expect(existsSync(join(home, "skills", "thermos", "SKILL.md"))).toBe(true);
			expect(existsSync(join(home, "skills", "thermos", "references", "deep-review-payload.md"))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("falls back to the DSH home folder and never writes into the shared agents folder", () => {
		const dir = makeTempDir("dsh-thermos-home-");
		try {
			const home = join(dir, "home");
			mkdirSync(home, { recursive: true });

			const result = run(["install", "--scope", "user"], {
				env: { DSH_HOME: "   ", HOME: home, USERPROFILE: home },
			});
			expect(result.exitCode).toBe(0);
			expect(existsSync(join(home, ".dsh", "skills", "thermos", "SKILL.md"))).toBe(true);
			expect(existsSync(join(home, ".agents"))).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("removes the installed skill and a stale flat skill file", () => {
		const dir = makeTempDir("dsh-thermos-remove-");
		try {
			mkdirSync(join(dir, ".git"));
			expect(run(["install", "--scope", "project", "--cwd", dir]).exitCode).toBe(0);

			const skillsDir = join(dir, ".dsh", "skills");
			writeFileSync(join(skillsDir, "thermos.md"), "stale", "utf8");

			const result = run(["remove", "--scope", "project", "--cwd", dir]);
			expect(result.exitCode).toBe(0);
			expect(existsSync(join(skillsDir, "thermos"))).toBe(false);
			expect(existsSync(join(skillsDir, "thermos.md"))).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("rejects invalid option values before it writes anything", () => {
		for (const args of [
			["install", "--scope", "bogus"],
			["install", "--scope"],
			["install", "--cwd"],
			["install", "--cwd", "--dry-run"],
			["install", "--unknown"],
			["remove", "--scope", "bogus"],
		]) {
			const dir = makeTempDir("dsh-thermos-invalid-");
			try {
				const result = run([...args, "--cwd", dir]);
				expect(result.exitCode).not.toBe(0);
				expect(existsSync(join(dir, ".dsh"))).toBe(false);
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		}
	});
});
