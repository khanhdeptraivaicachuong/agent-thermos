import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const manifests = [
	{
		packageJson: "packages/codex-thermos/package.json",
		manifest: "packages/codex-thermos/.codex-plugin/plugin.json",
	},
	{
		packageJson: "packages/claude-thermos/package.json",
		manifest: "packages/claude-thermos/.claude-plugin/plugin.json",
	},
];

const claudeMarketplace = {
	packageJson: "packages/claude-thermos/package.json",
	manifest: ".claude-plugin/marketplace.json",
};

for (const { packageJson, manifest } of manifests) {
	const pkg = JSON.parse(readFileSync(join(root, packageJson), "utf8")) as { version?: string };
	if (!pkg.version) throw new Error(`${packageJson} is missing version`);

	const manifestPath = join(root, manifest);
	const source = readFileSync(manifestPath, "utf8");
	const updated = source.replace(/("version":\s*")[^"]+(")/, `$1${pkg.version}$2`);
	if (updated === source && !source.includes(`"version": "${pkg.version}"`)) {
		throw new Error(`${manifest} is missing a version field`);
	}
	writeFileSync(manifestPath, updated);
}

{
	const pkg = JSON.parse(readFileSync(join(root, claudeMarketplace.packageJson), "utf8")) as { version?: string };
	if (!pkg.version) throw new Error(`${claudeMarketplace.packageJson} is missing version`);

	const manifestPath = join(root, claudeMarketplace.manifest);
	const source = readFileSync(manifestPath, "utf8");
	const marketplace = JSON.parse(source) as {
		plugins?: Array<{ name?: string; version?: string }>;
	};
	const plugin = marketplace.plugins?.find((entry) => entry.name === "thermos");
	if (!plugin) throw new Error(`${claudeMarketplace.manifest} is missing thermos plugin entry`);
	const updated = source.replace(/("name":\s*"thermos"[\s\S]*?"version":\s*")[^"]+(")/, `$1${pkg.version}$2`);
	if (updated === source && plugin.version !== pkg.version) {
		throw new Error(`${claudeMarketplace.manifest} is missing thermos plugin version field`);
	}
	writeFileSync(manifestPath, updated);
}

console.log(`Synced ${manifests.length + 1} plugin manifest versions from package.json.`);
