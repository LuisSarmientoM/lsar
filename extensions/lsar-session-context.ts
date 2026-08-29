import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	BeforeAgentStartEvent,
} from "@earendil-works/pi-coding-agent";

type Choice = "yes" | "no";
type ProjectPipelineConfig = { excluded: boolean; invalid: boolean };
type ContextEntry = {
	type: "custom";
	customType: string;
	data?: { choice?: Choice };
};

const AGENT_DIR =
	process.env.PI_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const SDD_BLOCK_PATH = path.join(
	AGENT_DIR,
	"references",
	"lsar-orchestration.md",
);

function loadSddBlock(): string | undefined {
	try {
		return readFileSync(SDD_BLOCK_PATH, "utf8");
	} catch {
		return undefined;
	}
}

function resolveProjectPipelineConfig(
	configPath: string,
): ProjectPipelineConfig {
	let raw: string;
	try {
		raw = readFileSync(configPath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			return { excluded: false, invalid: false };
		}
		return { excluded: false, invalid: true };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { excluded: false, invalid: true };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { excluded: false, invalid: true };
	}
	const pipeline = (parsed as Record<string, unknown>).pipeline;
	if (pipeline === undefined) return { excluded: false, invalid: false };
	if (pipeline === "never") return { excluded: true, invalid: false };
	return { excluded: false, invalid: true };
}

export default function lsarSessionContext(pi: ExtensionAPI) {
	let choice: Choice | undefined;
	let missingNotified = false;

	pi.registerFlag("sdd-pipeline", {
		description: "Fuerza el bloque SDD en modos sin UI (print/json)",
		type: "boolean",
		default: false,
	});

	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		const configPath = path.join(ctx.cwd, ".pi", "lsar.json");
		const config = resolveProjectPipelineConfig(configPath);
		if (config.invalid) notifyInvalidConfig(ctx, configPath);
		if (config.excluded) {
			notifyExcluded(ctx);
			choice = "no";
			return;
		}

		const entries = ctx.sessionManager.getEntries() as ContextEntry[];
		const saved = [...entries]
			.reverse()
			.find(
				(entry) =>
					entry.type === "custom" && entry.customType === "lsar-sdd-context",
			);
		if (saved?.data?.choice) {
			choice = saved.data.choice;
			return;
		}

		if (ctx.hasUI) {
			const yes = await ctx.ui.confirm("SDD pipeline", "¿quieres SDD pipeline?");
			choice = yes ? "yes" : "no";
		} else {
			choice = pi.getFlag("sdd-pipeline") === true ? "yes" : "no";
			process.stderr.write(`[lsar-session-context] headless choice=${choice}\n`);
		}

		pi.appendEntry("lsar-sdd-context", { choice });
		if (choice === "yes" && !loadSddBlock()) notifyMissing(ctx);
	});

	pi.on("before_agent_start", (event: BeforeAgentStartEvent) => {
		if (choice !== "yes") return;
		const block = loadSddBlock();
		if (!block) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
	});

	function notifyInvalidConfig(ctx: ExtensionContext, configPath: string) {
		const message = `Configuración inválida en ${configPath}; se ignora y se continúa sin excluir la pipeline SDD.`;
		if (ctx.hasUI) ctx.ui.notify(message, "warning");
		else process.stderr.write(`[lsar-session-context] ${message}\n`);
	}

	function notifyExcluded(ctx: ExtensionContext) {
		const message = "pipeline lsar desactivado";
		if (ctx.hasUI) ctx.ui.notify(message, "info");
		else process.stderr.write(`[lsar-session-context] ${message}\n`);
	}

	function notifyMissing(ctx: ExtensionContext) {
		if (missingNotified) return;
		missingNotified = true;
		const message = `No se pudo leer ${SDD_BLOCK_PATH}; se continúa sin el bloque SDD.`;
		if (ctx.hasUI) ctx.ui.notify(message, "warning");
		else process.stderr.write(`[lsar-session-context] ${message}\n`);
	}
}
