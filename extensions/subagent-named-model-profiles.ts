import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  selectStagedOption,
  type StagedOption,
} from "./subagent-profile-selector.ts";
type Assignment = { model: string; effort: string };
type Profile = Record<string, Assignment>;
const EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const rootDir = () =>
  process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const catalog = () => path.join(rootDir(), "subagent-profiles.json");
const note = (c: ExtensionContext, s: string, t: "info" | "warning" = "info") =>
  c.ui.notify(s, t);
function validProfile(p: unknown): asserts p is Profile {
  if (!p || typeof p !== "object" || Array.isArray(p) || !Object.keys(p).length)
    throw new Error("perfil inválido o vacío");
  for (const [a, v] of Object.entries(p))
    if (
      a !== path.basename(a) ||
      a === "." ||
      a === ".." ||
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      Object.keys(v).length !== 2 ||
      !Object.keys(v).every((k) => k === "model" || k === "effort") ||
      typeof v.model !== "string" ||
      !/^[^/]+\/.+$/.test(v.model.trim()) ||
      typeof v.effort !== "string" ||
      !EFFORTS.includes(v.effort)
    )
      throw new Error(`asignación inválida: ${a}`);
}
function load(): Record<string, Profile> {
  if (!existsSync(catalog())) return {};
  let v: unknown;
  try {
    v = JSON.parse(readFileSync(catalog(), "utf8"));
  } catch {
    throw new Error("JSON inválido en subagent-profiles.json");
  }
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("catálogo inválido");
  for (const [n, p] of Object.entries(v)) {
    if (!n.trim()) throw new Error("nombre de perfil vacío");
    validProfile(p);
  }
  return v as Record<string, Profile>;
}
function save(v: Record<string, Profile>) {
  mkdirSync(rootDir(), { recursive: true });
  const tmp = `${catalog()}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n", { flag: "wx" });
  try {
    renameSync(tmp, catalog());
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw e;
  }
}
const agents = () => {
  const d = path.join(rootDir(), "agents");
  return existsSync(d)
    ? readdirSync(d)
        .filter((n) => n.endsWith(".md") && lstatSync(path.join(d, n)).isFile())
        .map((n) => n.slice(0, -3))
        .sort()
    : [];
};
const models = (c: ExtensionContext) =>
  c.modelRegistry
    .getAvailable()
    .map((m) => `${m.provider}/${m.id}`)
    .sort();
// Etiquetado puro (separación label/value; D6/D7). `value` es siempre el
// identificador exacto; `label` es la representación visible decorada.
// Los modelos salen del borrador (`profile`), nunca de una relectura del
// frontmatter (C9, C10, C14).
export function agentOptions(
  names: string[],
  profile: Profile,
): StagedOption[] {
  return names.map((name) => ({
    value: name,
    label: profile[name] ? `${name} — ${profile[name].model}` : name,
  }));
}
// El modelo actual del agente en edición se marca con sufijo "(actual)" sin
// alterar el orden de la lista ni la opción enfocada (C11). Si `current` no
// está en el catálogo, ninguna opción lleva marca; no se inyecta la ausente.
export function modelOptions(
  list: string[],
  current: string | undefined,
): StagedOption[] {
  return list.map((id) => ({
    value: id,
    label: id === current ? `${id} (actual)` : id,
  }));
}
async function pick(c: ExtensionContext, p: Record<string, Profile>) {
  const n = Object.keys(p).sort();
  return n.length ? c.ui.select("Perfil", n) : undefined;
}
async function edit(
  c: ExtensionContext,
  d: { name: string; profile: Profile },
) {
  const plain = (values: string[]): StagedOption[] =>
    values.map((v) => ({ value: v, label: v }));
  while (true) {
    const op = await selectStagedOption(
      c,
      `Editar ${d.name}`,
      plain([
        "Renombrar",
        "Añadir agente",
        "Editar agente",
        "Quitar agente",
        "Guardar",
        "Cancelar",
      ]),
      { searchable: false },
    );
    if (!op || op === "Cancelar") {
      note(c, "Operación cancelada; no se escribió ningún cambio.");
      return false;
    }
    if (op === "Renombrar") {
      const n = await c.ui.input("Nombre", d.name);
      if (n?.trim()) d.name = n.trim();
    } else if (op === "Añadir agente") {
      const a = await selectStagedOption(
        c,
        "Agente",
        agentOptions(
          agents().filter((x) => !d.profile[x]),
          d.profile,
        ),
        { searchable: true },
      );
      if (a) {
        const m = await selectStagedOption(
          c,
          "Modelo",
          modelOptions(models(c), d.profile[a]?.model),
          { searchable: true },
        );
        const e =
          m &&
          (await selectStagedOption(c, "Effort", plain(EFFORTS), {
            searchable: false,
          }));
        if (m && e) d.profile[a] = { model: m, effort: e };
      }
    } else if (op === "Editar agente") {
      const a = await selectStagedOption(
        c,
        "Agente",
        agentOptions(Object.keys(d.profile), d.profile),
        { searchable: true },
      );
      if (a) {
        const m = await selectStagedOption(
          c,
          "Modelo",
          modelOptions(models(c), d.profile[a]?.model),
          { searchable: true },
        );
        const e =
          m &&
          (await selectStagedOption(c, "Effort", plain(EFFORTS), {
            searchable: false,
          }));
        if (m && e) d.profile[a] = { model: m, effort: e };
      }
    } else if (op === "Quitar agente") {
      const a = await selectStagedOption(
        c,
        "Agente",
        agentOptions(Object.keys(d.profile), d.profile),
        { searchable: true },
      );
      if (a) delete d.profile[a];
    } else {
      validProfile(d.profile);
      if (await c.ui.confirm("Guardar snapshot", `Guardar ${d.name}?`))
        return true;
      note(c, "Guardado cancelado; no se escribió ningún cambio.");
      return false;
    }
  }
}
function prepared(agent: string, value: Assignment) {
  if (agent !== path.basename(agent))
    throw new Error(`identificador inseguro: ${agent}`);
  const file = path.join(rootDir(), "agents", `${agent}.md`);
  if (!existsSync(file) || !lstatSync(file).isFile())
    throw new Error(`agente inexistente: ${agent}`);
  const text = readFileSync(file, "utf8"),
    match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`frontmatter ausente: ${agent}`);
  const lines = match[1].split(/\r?\n/),
    find = (k: string) =>
      lines
        .map((x, i) => {
          const m = new RegExp(`^${k}:\\s*(.*)$`).exec(x);
          return m ? ([i, m[1]] as [number, string]) : null;
        })
        .filter((x): x is [number, string] => x !== null);
  const ms = find("model"),
    es = find("effort");
  if (ms.length !== 1 || es.length !== 1)
    throw new Error(`frontmatter inválido: ${agent}`);
  const body = match[1]
    .replace(/^model:[^\r\n]*$/m, `model: ${value.model}`)
    .replace(/^effort:[^\r\n]*$/m, `effort: ${value.effort}`);
  const head = match[0].replace(match[1], body);
  return {
    file,
    old: text,
    next: head + text.slice(match[0].length),
    before: { model: ms[0][1], effort: es[0][1] },
  };
}
export default function extension(pi: ExtensionAPI) {
  const crud = (kind: "create" | "edit") =>
    pi.registerCommand(`subagent-profile-${kind}`, {
      description: `${kind} subagent profile`,
      handler: async (_a, c) => {
        if (!c.hasUI)
          return note(c, "Este comando requiere UI interactiva.", "warning");
        if (typeof c.ui.custom !== "function")
          return note(
            c,
            "Este comando requiere una interfaz de terminal interactiva (no disponible en este modo).",
            "warning",
          );
        try {
          const p = load();
          const old = kind === "edit" ? await pick(c, p) : undefined;
          if (kind === "edit" && !old) throw new Error("perfil inexistente");
          const d = {
            name: old || (await c.ui.input("Nombre de perfil"))?.trim() || "",
            profile: old ? JSON.parse(JSON.stringify(p[old])) : {},
          };
          if (!d.name || !(await edit(c, d))) return;
          if (p[d.name] && d.name !== old)
            throw new Error(`perfil duplicado: ${d.name}`);
          validProfile(d.profile);
          const next = { ...p };
          if (old) delete next[old];
          next[d.name] = d.profile;
          save(next);
          note(c, `Perfil guardado: ${d.name}`);
        } catch (e) {
          note(c, String(e instanceof Error ? e.message : e), "warning");
        }
      },
    });
  crud("create");
  crud("edit");
  pi.registerCommand("subagent-profile-delete", {
    description: "Delete subagent profile",
    handler: async (_a, c) => {
      if (!c.hasUI)
        return note(c, "Este comando requiere UI interactiva.", "warning");
      try {
        const p = load(),
          n = await pick(c, p);
        if (!n) return note(c, "No hay perfiles.", "warning");
        if (!(await c.ui.confirm("Eliminar perfil", `Borrar ${n}?`)))
          return note(c, "Eliminación cancelada.");
        delete p[n];
        save(p);
        note(c, `Perfil eliminado: ${n}`);
      } catch (e) {
        note(c, String(e instanceof Error ? e.message : e), "warning");
      }
    },
  });
  pi.registerCommand("subagent-profile-apply", {
    description: "Apply subagent profile",
    handler: async (_a, c) => {
      if (!c.hasUI)
        return note(c, "Este comando requiere UI interactiva.", "warning");
      try {
        const p = load(),
          n = await pick(c, p);
        if (!n) throw new Error("perfil inexistente");
        validProfile(p[n]);
        const plans = Object.entries(p[n]).map(([agent, v]) => ({
          agent,
          ...prepared(agent, v),
        }));
        const diff = plans
          .map(
            (x) =>
              `${x.agent}: model ${x.before.model} -> ${p[n][x.agent].model}; effort ${x.before.effort} -> ${p[n][x.agent].effort}`,
          )
          .join("\n");
        if (!(await c.ui.confirm("Aplicar perfil", `${n}\n${diff}`)))
          return note(c, "Aplicación cancelada.");
        const changed = plans.filter((x) => x.old !== x.next);
        if (!changed.length) return note(c, "No-op: ningún agente cambia.");
        const done: typeof changed = [];
        try {
          for (const x of changed) {
            const tmp = `${x.file}.${process.pid}.${Date.now()}.tmp`;
            writeFileSync(tmp, x.next, { flag: "wx" });
            renameSync(tmp, x.file);
            done.push(x);
          }
        } catch (e) {
          const residual: string[] = [];
          for (const x of done)
            try {
              const tmp = `${x.file}.${process.pid}.rollback`;
              writeFileSync(tmp, x.old, { flag: "wx" });
              renameSync(tmp, x.file);
            } catch {
              residual.push(x.file);
            }
          note(
            c,
            `Aplicación fallida; rollback intentado: ${e}${residual.length ? `; archivos posiblemente modificados: ${residual.join(", ")}` : ""}`,
            "warning",
          );
          return;
        }
        try {
          await c.reload();
        } catch (e) {
          note(
            c,
            `Aplicado, pero /reload falló; ejecuta /reload manualmente: ${e}`,
            "warning",
          );
        }
      } catch (e) {
        note(c, String(e instanceof Error ? e.message : e), "warning");
      }
    },
  });
}
