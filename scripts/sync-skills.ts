import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sharedSkills = ["thermo-nuclear-review", "thermo-nuclear-code-quality-review"];
const codexPackageDir = "packages/codex-thermos";
const piPackageDir = "packages/pi-thermos";

rmSync(join(root, piPackageDir, "skills"), { recursive: true, force: true });

for (const skill of sharedSkills) {
	const source = join(root, "packages/core/skills", skill, "SKILL.md");
	const codexReferenceTarget = join(root, codexPackageDir, "skills", "thermos", "references", `${skill}.md`);

	mkdirSync(dirname(codexReferenceTarget), { recursive: true });
	copyFileSync(source, codexReferenceTarget);

	rmSync(join(root, codexPackageDir, "skills", skill), { recursive: true, force: true });
}

console.log(`Synced ${sharedSkills.length} shared skills into Codex Thermos references.`);
