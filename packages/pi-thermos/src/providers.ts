import { contextSectionLabels, contextSectionPlaceholders, reviewerTaskHead } from "./generated/prompts.ts";

export type PiThermosProvider = "nico" | "gotgenes" | "tintinweb";

export type ProviderPreference = PiThermosProvider | "auto";

export interface ToolLike {
	name?: string;
	inputSchema?: unknown;
	schema?: unknown;
	parameters?: unknown;
	description?: string;
}

export interface DetectionInput {
	preferred?: ProviderPreference;
	packages?: Record<string, boolean | undefined>;
	tools?: ToolLike[];
}

export interface DetectionResult {
	provider: PiThermosProvider | null;
	reason: string;
}

const providers: PiThermosProvider[] = ["nico", "gotgenes", "tintinweb"];

export function detectPiSubagentsProvider(input: DetectionInput = {}): DetectionResult {
	const preferred = input.preferred ?? "auto";
	if (preferred !== "auto") {
		return providers.includes(preferred)
			? { provider: preferred, reason: `explicit provider ${preferred}` }
			: { provider: null, reason: `unknown explicit provider ${preferred}` };
	}

	const packageMap = input.packages ?? {};
	if (packageMap["pi-subagents"]) return { provider: "nico", reason: "detected package pi-subagents" };
	if (packageMap["@gotgenes/pi-subagents"]) {
		return { provider: "gotgenes", reason: "detected package @gotgenes/pi-subagents" };
	}
	if (packageMap["@tintinweb/pi-subagents"]) {
		return { provider: "tintinweb", reason: "detected package @tintinweb/pi-subagents" };
	}

	const tools = input.tools ?? [];
	const subagent = tools.find((tool) => tool.name === "subagent");
	const agent = tools.find((tool) => tool.name === "Agent");

	if (subagent) {
		const properties = toolProperties(subagent);
		if (properties.has("tasks") || properties.has("chain") || properties.has("action")) {
			return { provider: "nico", reason: "detected Nico subagent tool schema" };
		}
		if (properties.has("subagent_type")) {
			return { provider: "gotgenes", reason: "detected Gotgenes subagent tool schema" };
		}
		return { provider: "gotgenes", reason: "detected generic subagent tool" };
	}

	if (agent) {
		const properties = toolProperties(agent);
		if (properties.has("subagent_type") || /subagent/i.test(agent.description ?? "")) {
			return { provider: "tintinweb", reason: "detected Tintinweb Agent tool schema" };
		}
	}

	return { provider: null, reason: "no supported Pi subagents provider detected" };
}

function toolProperties(tool: ToolLike): Set<string> {
	const roots = [tool.inputSchema, tool.schema, tool.parameters];
	const names = new Set<string>();
	for (const root of roots) {
		if (!root || typeof root !== "object") continue;
		collectProperties(root as Record<string, unknown>, names);
	}
	return names;
}

function collectProperties(value: Record<string, unknown>, names: Set<string>) {
	const props = value.properties;
	if (props && typeof props === "object") {
		for (const key of Object.keys(props)) names.add(key);
	}
	for (const child of Object.values(value)) {
		if (child && typeof child === "object") collectProperties(child as Record<string, unknown>, names);
	}
}

export interface ThermosPayload {
	provider: PiThermosProvider;
	calls: Array<{ tool: "subagent" | "Agent"; args: Record<string, unknown> }>;
}

export function buildThermosPayload(provider: PiThermosProvider, prompt: string): ThermosPayload {
	const shared = buildSharedPrompt(prompt);
	if (provider === "nico") {
		return {
			provider,
			calls: [
				{
					tool: "subagent",
					args: {
						tasks: [
							{
								agent: "thermo-nuclear-review-subagent",
								task: shared,
							},
							{
								agent: "thermo-nuclear-code-quality-review-subagent",
								task: shared,
							},
						],
						concurrency: 2,
						async: true,
					},
				},
			],
		};
	}

	const tool = provider === "tintinweb" ? "Agent" : "subagent";
	return {
		provider,
		calls: [
			{
				tool,
				args: {
					subagent_type: "thermo-nuclear-review-subagent",
					prompt: shared,
					description: "Thermo-nuclear deep review",
					run_in_background: true,
				},
			},
			{
				tool,
				args: {
					subagent_type: "thermo-nuclear-code-quality-review-subagent",
					prompt: shared,
					description: "Thermo-nuclear code-quality review",
					run_in_background: true,
				},
			},
		],
	};
}

function buildSharedPrompt(prompt: string): string {
	return `${reviewerTaskHead}

${contextSectionLabel(0)}
${contextSectionPlaceholder(0)}

${contextSectionLabel(1)}
${contextSectionPlaceholder(1)}

${contextSectionLabel(2)}
${prompt}`;
}

function contextSectionLabel(index: number): string {
	const label = contextSectionLabels[index];
	if (label === undefined) {
		throw new Error(`Generated context section label ${index} is missing`);
	}
	return label;
}

function contextSectionPlaceholder(index: number): string {
	const placeholder = contextSectionPlaceholders[index];
	if (placeholder === undefined) {
		throw new Error(`Generated context section placeholder ${index} is missing`);
	}
	return placeholder;
}
