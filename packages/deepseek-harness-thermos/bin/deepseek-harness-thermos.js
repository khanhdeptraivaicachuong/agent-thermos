#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceSkillDir = resolve(packageRoot, "skill", "thermos");
const skillName = "thermos";
const scopes = new Set(["project", "user"]);

function usage() {
	console.log(`deepseek-harness-thermos

Usage:
  deepseek-harness-thermos install [--scope project|user] [--cwd <path>] [--dry-run]
  deepseek-harness-thermos remove [--scope project|user] [--cwd <path>] [--dry-run]

Installs the Thermos skill for DeepSeek Harness. The skill is invoked with /thermos.`);
}

function readOptionValue(args, index, flag) {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${flag} requires a value`);
	}
	return value;
}

/**
 * Walk up from a directory to the nearest ancestor that holds a .git marker, the
 * way the harness finds the project root. Returns null when there is none.
 */
function findGitRoot(startDir) {
	let current = resolve(startDir);
	for (;;) {
		if (existsSync(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function dshHome() {
	const configured = process.env.DSH_HOME;
	if (configured && configured.trim() !== "") return resolve(configured.trim());
	return resolve(homedir(), ".dsh");
}

/**
 * The agents home is shared with other runtimes, so a skill of this name there
 * would collide with another host's skill. Never write into it.
 */
function assertNotSharedAgentsDir(target) {
	const segments = target.split(/[\\/]+/);
	// Windows and macOS treat names case-insensitively, so `.Agents` is the same
	// directory as `.agents`, and any occurrence of the pair puts the target
	// inside the shared tree, not only the last one.
	const insideSharedTree = segments.some(
		(segment, index) => segment.toLowerCase() === ".agents" && segments[index + 1]?.toLowerCase() === "skills",
	);
	if (insideSharedTree) {
		throw new Error(`Refusing to write into the shared agents skills directory: ${target}`);
	}
}

function resolveSkillsRoot(scope, cwd) {
	if (scope === "user") {
		return { skillsDir: resolve(dshHome(), "skills"), gitRoot: null };
	}

	const gitRoot = findGitRoot(cwd);
	const root = gitRoot ?? resolve(cwd);
	return { skillsDir: resolve(root, ".dsh", "skills"), gitRoot };
}

function install(scope, cwd, dryRun) {
	if (!existsSync(sourceSkillDir)) {
		throw new Error(`The packaged skill is missing at ${sourceSkillDir}`);
	}

	const { skillsDir, gitRoot } = resolveSkillsRoot(scope, cwd);
	const targetDir = resolve(skillsDir, skillName);
	const staleFlatFile = resolve(skillsDir, `${skillName}.md`);
	assertNotSharedAgentsDir(targetDir);

	if (scope === "project" && gitRoot === null) {
		console.log(`No .git ancestor found from ${resolve(cwd)}; installing into that directory.`);
	}

	if (dryRun) {
		console.log(`Would install the Thermos skill at ${targetDir}`);
		console.log(`Would copy ${sourceSkillDir} into ${targetDir}`);
		if (existsSync(staleFlatFile)) {
			console.log(`Would remove the stale flat skill at ${staleFlatFile}`);
		}
		return;
	}

	mkdirSync(skillsDir, { recursive: true });
	rmSync(targetDir, { recursive: true, force: true });
	rmSync(staleFlatFile, { force: true });
	cpSync(sourceSkillDir, targetDir, { recursive: true });

	console.log(`Installed the Thermos skill at ${targetDir}`);
}

function remove(scope, cwd, dryRun) {
	const { skillsDir } = resolveSkillsRoot(scope, cwd);
	const targetDir = resolve(skillsDir, skillName);
	const staleFlatFile = resolve(skillsDir, `${skillName}.md`);
	assertNotSharedAgentsDir(targetDir);

	const present = [targetDir, staleFlatFile].filter((path) => existsSync(path));

	if (dryRun) {
		for (const path of present) {
			console.log(`Would remove ${path}`);
		}
		if (present.length === 0) {
			console.log(`No Thermos skill found at ${targetDir}`);
		}
		return;
	}

	if (present.length === 0) {
		console.log(`No Thermos skill found at ${targetDir}`);
		return;
	}

	for (const path of present) {
		rmSync(path, { recursive: true, force: true });
		console.log(`Removed ${path}`);
	}
}

function main(argv) {
	if (argv.includes("--help") || argv.includes("-h")) {
		usage();
		process.exit(0);
	}

	const command = argv[0];
	if (command !== "install" && command !== "remove") {
		usage();
		process.exit(argv.length === 0 ? 0 : 1);
	}

	let scope = "project";
	let cwd = process.cwd();
	let dryRun = false;

	for (let i = 1; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--scope") {
			scope = readOptionValue(argv, i, arg);
			i++;
		} else if (arg === "--cwd") {
			cwd = resolve(readOptionValue(argv, i, arg));
			i++;
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (!scopes.has(scope)) {
		throw new Error(`--scope must be "project" or "user", got ${scope}`);
	}

	if (command === "install") {
		install(scope, cwd, dryRun);
		return;
	}
	remove(scope, cwd, dryRun);
}

try {
	main(process.argv.slice(2));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
