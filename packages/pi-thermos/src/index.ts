import { contextSectionLabels, thermosWorkflow } from "./generated/prompts.ts";
import { buildThermosPayload, detectPiSubagentsProvider, type PiThermosProvider, type ToolLike } from "./providers.ts";

interface CommandContextLike {
	ui?: {
		notify?: (message: string, type?: "info" | "warning" | "error") => void;
	};
}

interface RegisteredCommandLike {
	description?: string;
	argumentHint?: string;
	handler: (args?: string, ctx?: CommandContextLike) => Promise<void> | void;
}

interface PiLike {
	tools?: ToolLike[];
	getAllTools?: () => ToolLike[];
	registerCommand?: (name: string, command: RegisteredCommandLike) => void;
	sendUserMessage?: (content: string, options?: { deliverAs?: "steer" | "followUp" }) => void;
	registerTool?: (tool: unknown) => void;
}

export default function thermosExtension(pi: PiLike = {}) {
	pi.registerCommand?.("thermos", {
		description: "Run deep correctness/security and strict code-quality reviews of the current branch.",
		argumentHint: "[base-ref | PR URL | scope]",
		async handler(args = "", ctx = {}) {
			const detection = detectPiSubagentsProvider({ tools: getPiTools(pi) });
			if (!detection.provider) {
				ctx.ui?.notify?.(`Thermos could not detect a supported Pi subagents provider: ${detection.reason}`, "error");
				return;
			}

			const prompt = buildThermosPrompt(detection.provider, args.trim() || "current branch");
			if (!pi.sendUserMessage) {
				ctx.ui?.notify?.("Thermos generated a provider prompt, but this Pi runtime cannot submit it.", "warning");
				return;
			}

			pi.sendUserMessage(prompt);
		},
	});

	return { name: "thermos", detection: detectPiSubagentsProvider({ tools: pi.tools ?? [] }) };
}

function getPiTools(pi: PiLike): ToolLike[] {
	return pi.getAllTools?.() ?? pi.tools ?? [];
}

export function buildThermosPrompt(provider: PiThermosProvider, scope: string): string {
	const payload = buildThermosPayload(provider, scope);
	const calls = payload.calls
		.map((call, index) => `${index + 1}. Call \`${call.tool}\` with:\n${JSON.stringify(call.args, null, 2)}`)
		.join("\n\n");
	const evidenceSections = contextSectionLabels.map((label) => `- \`${label}\``).join("\n");

	return `Run Thermos against this scope:

${scope}

Use the ${provider} Pi subagent provider.

${thermosWorkflow}

## Pi Provider Calls

Populate the same scoped evidence into each tool call below by replacing the placeholder sections in its prompt/task:
${evidenceSections}

${calls}`;
}

export { buildThermosPayload, detectPiSubagentsProvider };
