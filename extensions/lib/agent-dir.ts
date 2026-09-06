import os from "node:os";
import path from "node:path";

// Directorio base del agente. Precedencia: PI_CODING_AGENT_DIR, PI_AGENT_DIR,
// ~/.pi/agent. Acepta ambas vars porque el repo las usó de forma
// inconsistente (perfiles vs session-context vs sync-to-pi.sh).
export function resolveAgentDir(): string {
  return (
    process.env.PI_CODING_AGENT_DIR ||
    process.env.PI_AGENT_DIR ||
    path.join(os.homedir(), ".pi", "agent")
  );
}
