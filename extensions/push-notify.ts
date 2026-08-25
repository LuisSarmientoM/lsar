import { execFile } from "node:child_process";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const BODY = "Turno finalizado";
const DISABLED_VALUES = new Set(["0", "false", "off"]);

function envEnabled(): boolean {
	const raw = process.env.LSAR_PUSH_NOTIFY;
	if (raw === undefined) return true;
	return !DISABLED_VALUES.has(raw.trim().toLowerCase());
}

function shouldNotify(ctx: ExtensionContext): boolean {
	return envEnabled() && ctx.mode === "tui" && ctx.hasUI;
}

function buildTitle(ctx: ExtensionContext): string {
	return path.basename(ctx.cwd) || "Directorio raíz";
}

function escapeForAppleScript(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatTimestamp(date: Date): string {
	const day = date.getDate().toString().padStart(2, "0");
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const hours = date.getHours().toString().padStart(2, "0");
	const minutes = date.getMinutes().toString().padStart(2, "0");
	return `${day}/${month} ${hours}:${minutes}`;
}

type OriginToken = { windowId: string; tabId: string };
let terminalNotifierAvailable: boolean | undefined;

function isGhosttyTerminal(): boolean {
	return process.platform === "darwin" && process.env.TERM_PROGRAM === "ghostty";
}

function logChannelFailure(
	channel: string,
	error: Error | null,
	code?: number | null,
): void {
	const message = error?.message ?? "non-zero exit";
	process.stderr.write(
		`[push-notify] canal=${channel} code=${code ?? "unknown"} error=${message}\n`,
	);
}

function notifyViaOsascriptFallback(
	title: string,
	body: string,
	soundName: "Blow" | "Sosumi",
): void {
	if (process.platform !== "darwin") return;
	const base = `display notification "${escapeForAppleScript(body)}" with title "${escapeForAppleScript(title)}"`;
	const withSound = `${base} sound name "${soundName}"`;
	const run = (script: string, degraded: boolean): void => {
		execFile("osascript", ["-e", script], { timeout: 2000 }, (error) => {
			if (!error) return;
			if (!degraded) {
				logChannelFailure("osascript-fallback-sound", error, typeof error.code === "number" ? error.code : null);
				run(base, true);
				return;
			}
			logChannelFailure("osascript-fallback", error, typeof error.code === "number" ? error.code : null);
		});
	};
	run(withSound, false);
}

function hasTerminalNotifier(callback: (available: boolean) => void): void {
	if (terminalNotifierAvailable !== undefined) {
		callback(terminalNotifierAvailable);
		return;
	}
	execFile("sh", ["-c", "command -v terminal-notifier"], { timeout: 1000 }, (error) => {
		terminalNotifierAvailable = !error;
		callback(terminalNotifierAvailable);
	});
}

function captureOriginToken(
	callback: (token: OriginToken | null) => void,
): void {
	if (!isGhosttyTerminal()) {
		callback(null);
		return;
	}
	const script =
		'tell application id "com.mitchellh.ghostty" to get {id of front window, id of selected tab of front window}';
	execFile("osascript", ["-e", script], { timeout: 2000 }, (error, stdout) => {
		if (error) {
			logChannelFailure(
				"origin-capture",
				error,
				error.code && typeof error.code === "number" ? error.code : null,
			);
			callback(null);
			return;
		}
		const values = stdout.trim().split(",").map((value) => value.trim());
		const isSafeId = (value: string): boolean => /^[A-Za-z0-9_-]+$/.test(value);
		callback(
			values.length === 2 && values.every(isSafeId)
				? { windowId: values[0], tabId: values[1] }
				: null,
		);
	});
}

function clickScript(token: OriginToken | null): string {
	const idsAreSafe =
		token && /^[A-Za-z0-9_-]+$/.test(token.windowId) && /^[A-Za-z0-9_-]+$/.test(token.tabId);
	const select = idsAreSafe
		? `try\nselect tab (tab id "${token.tabId}" of window id "${token.windowId}")\non error\nend try`
		: "";
	const appleScript = `tell application id "com.mitchellh.ghostty"\nactivate${select ? `\n${select}` : ""}\nend tell`;
	return `pgrep -x ghostty >/dev/null 2>&1 || exit 0\nosascript -e '${appleScript}' >/dev/null 2>&1\nexit 0`;
}

function notifyViaTerminalNotifier(
	title: string,
	body: string,
	token: OriginToken | null,
	soundName: "Blow" | "Sosumi",
): void {
	execFile(
		"terminal-notifier",
		["-title", title, "-message", body, "-sound", soundName, "-execute", clickScript(token)],
		(error) => {
			if (error)
				logChannelFailure(
					"terminal-notifier",
					error,
					error.code && typeof error.code === "number" ? error.code : null,
				);
		},
	);
}

export default function pushNotify(pi: ExtensionAPI): void {
	let originToken: OriginToken | null = null;
	let lastAssistantStopReason: string | undefined;
	pi.on("session_start", () => {
		captureOriginToken((token) => {
			originToken = token;
		});
	});
	pi.on("message_end", (event) => {
		if (event.message.role === "assistant") {
			lastAssistantStopReason = event.message.stopReason;
		}
	});
	pi.on("agent_settled", (_event, ctx) => {
		const isError = lastAssistantStopReason === "error" || lastAssistantStopReason === "aborted" || lastAssistantStopReason === "length";
		const soundName = isError ? "Sosumi" : "Blow";
		lastAssistantStopReason = undefined;
		if (!shouldNotify(ctx)) return;
		const title = buildTitle(ctx);
		let body = BODY;
		try {
			body = `${BODY} · ${formatTimestamp(new Date())}`;
		} catch {
			body = BODY;
		}
		if (isGhosttyTerminal()) {
			hasTerminalNotifier((available) => {
				if (available) notifyViaTerminalNotifier(title, body, originToken, soundName);
				else notifyViaOsascriptFallback(title, body, soundName);
			});
		} else {
			notifyViaOsascriptFallback(title, body, soundName);
		}
	});
}
