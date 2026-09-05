// Pruebas de las partes puras y del resumen de `apply` en
// `subagent-named-model-profiles.ts` (C9–C12, C14). El resumen se ejercita
// contra el handler real usando un `PI_CODING_AGENT_DIR` temporal y
// cancelando el `confirm`, por lo que no escribe en los agentes fuente.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import extension, {
  agentOptions,
  modelOptions,
} from "./subagent-named-model-profiles.ts";

type Cmd = { handler(args: unknown, ctx: unknown): Promise<void> };

test("C9/C10: agentOptions etiqueta cada agente con su modelo del borrador; sin asignación = solo nombre", () => {
  const profile = {
    "lsar-arch": { model: "openai/gpt-x", effort: "high" },
    "lsar-coder": { model: "anthropic/claude-y", effort: "low" },
  };
  const opts = agentOptions(["lsar-arch", "lsar-coder", "helper"], profile);
  assert.deepEqual(
    opts.map((o) => o.value),
    ["lsar-arch", "lsar-coder", "helper"],
  );
  assert.equal(opts[0].label, "lsar-arch — openai/gpt-x");
  assert.equal(opts[1].label, "lsar-coder — anthropic/claude-y");
  // Sin asignación en el borrador: distinguible, solo el nombre.
  assert.equal(opts[2].label, "helper");
});

test("C11: modelOptions marca '(actual)' sin alterar orden ni valor devuelto", () => {
  const list = ["a/x", "b/y", "c/z"];
  const opts = modelOptions(list, "b/y");
  // Orden idéntico a la fuente y `value` limpio (no se reordena hacia delante).
  assert.deepEqual(
    opts.map((o) => o.value),
    ["a/x", "b/y", "c/z"],
  );
  assert.equal(opts[0].label, "a/x");
  assert.equal(opts[1].label, "b/y (actual)");
  assert.equal(opts[2].label, "c/z");
});

test("C11: si el modelo actual no está en el catálogo, ninguna opción se marca (no se inyecta)", () => {
  const opts = modelOptions(["a/x", "c/z"], "b/missing");
  assert.ok(opts.every((o) => !o.label.includes("(actual)")));
  assert.deepEqual(
    opts.map((o) => o.label),
    ["a/x", "c/z"],
  );
});

test("C12/C14: el resumen de apply identifica por nombre de agente, sin ruta ni .md, conservando before -> nuevo", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lsar-profiles-"));
  try {
    const agentsDir = path.join(root, "agents");
    mkdirSync(agentsDir, { recursive: true });
    const agentFile = (name: string, model: string, effort: string) =>
      writeFileSync(
        path.join(agentsDir, `${name}.md`),
        `---\ndescription: ${name}\nmodel: ${model}\neffort: ${effort}\n---\nbody\n`,
      );
    agentFile("a", "prov/old-a", "low");
    agentFile("b", "prov/old-b", "low");
    const catalog = {
      myp: {
        a: { model: "prov/new-a", effort: "high" },
        b: { model: "prov/new-b", effort: "medium" },
      },
    };
    writeFileSync(
      path.join(root, "subagent-profiles.json"),
      JSON.stringify(catalog),
    );
    process.env.PI_CODING_AGENT_DIR = root;

    const cmds: Record<string, Cmd> = {};
    extension({
      registerCommand: (name: string, def: Cmd) => {
        cmds[name] = def;
      },
    } as never);

    let confirmMessage = "";
    const notes: string[] = [];
    const ctx = {
      hasUI: true,
      ui: {
        custom: async () => undefined,
        select: async () => "myp",
        confirm: async (_t: string, message: string) => {
          confirmMessage = message;
          return false; // cancel: no se escribe nada
        },
        notify: (_m: string, _t?: string) => {
          notes.push(_m);
        },
        input: async () => undefined,
      },
      modelRegistry: { getAvailable: () => [] },
      reload: async () => {},
    };

    await cmds["subagent-profile-apply"].handler([], ctx);

    // Identifica a cada agente por su nombre.
    assert.match(confirmMessage, /^myp\n/m);
    assert.match(confirmMessage, /(^|\n)a: model prov\/old-a -> prov\/new-a; effort low -> high/);
    assert.match(confirmMessage, /(^|\n)b: model prov\/old-b -> prov\/new-b; effort low -> medium/);
    // Sin ruta absoluta ni sufijo .md en el identificador mostrado.
    assert.ok(!confirmMessage.includes(".md"), "no debe contener .md");
    assert.ok(
      !confirmMessage.includes(agentsDir),
      "no debe contener la ruta de agents/",
    );
    assert.ok(
      !confirmMessage.includes("agents/"),
      "no debe contener segmento de ruta 'agents/'",
    );
    // Cancelado antes de escribir: ningún agente cambió en disco.
    assert.deepEqual(notes, ["Aplicación cancelada."]);
    assert.match(
      readFileSync(path.join(agentsDir, "a.md"), "utf8"),
      /^model: prov\/old-a$/m,
    );
  } finally {
    delete process.env.PI_CODING_AGENT_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});
