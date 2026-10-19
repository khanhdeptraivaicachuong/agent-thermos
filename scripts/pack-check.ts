import { accessSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const packages = [
	{
		name: "@thinkscape/codex-thermos",
		dir: "packages/codex-thermos",
		required: [
			"package.json",
			"README.md",
			".codex-plugin/plugin.json",
			"skills/thermos/SKILL.md",
			"skills/thermos/references/thermo-nuclear-review.md",
			"skills/thermos/references/thermo-nuclear-code-quality-review.md",
			"assets/logo.png",
		],
		forbidden: ["skills/thermo-nuclear-review", "skills/thermo-nuclear-code-quality-review"],
	},
	{
		name: "@thinkscape/claude-thermos",
		dir: "packages/claude-thermos",
		required: [
			"package.json",
			"README.md",
			".claude-plugin/plugin.json",
			"commands/run.md",
			"shims/thermos.md",
			"bin/claude-thermos.js",
			"assets/logo.png",
		],
		forbidden: [],
	},
	{
		name: "@thinkscape/pi-thermos",
		dir: "packages/pi-thermos",
		required: ["package.json", "README.md", "src/providers.ts", "bin/pi-thermos.js", "assets/logo.png"],
		forbidden: ["skills"],
	},
];

for (const pkg of packages) {
	const pkgJson = JSON.parse(readFileSync(join(root, pkg.dir, "package.json"), "utf8")) as { name?: string };
	if (pkgJson.name !== pkg.name) {
		throw new Error(`${pkg.dir}/package.json has name ${pkgJson.name}; expected ${pkg.name}`);
	}

	for (const file of pkg.required) {
		accessSync(join(root, pkg.dir, file));
	}

	for (const file of pkg.forbidden) {
		if (existsSync(join(root, pkg.dir, file))) {
			throw new Error(`${pkg.dir}/${file} must not be included in the package`);
		}
	}
}

console.log(`Validated package contents for ${packages.length} public packages.`);
