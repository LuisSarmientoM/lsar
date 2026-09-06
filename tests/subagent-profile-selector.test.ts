// Harness enfocado para `selectStagedOption` (C1–C8, C13). Usa el
// `KeybindingsManager` global real de `@earendil-works/pi-tui` (mismas tablas
// que la producción) y dobles mínimos de `tui`/`theme`/`ui.custom`. El `Input`
// interno resuelve teclas con el keybinding global, así que se alimentan bytes
// reales; la navegación se decide con el manager pasado a la fábrica.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Input, getKeybindings } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  selectStagedOption,
  type StagedOption,
} from "../extensions/lib/subagent-profile-selector.ts";

const UP = "\x1b[A";
const DOWN = "\x1b[B";
const ENTER = "\r";
const ESC = "\x1b";
const BACKSPACE = "\x7f";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;
const tui = { requestRender() {} } as never;

function open(
  title: string,
  options: StagedOption[],
  opts?: { searchable?: boolean },
): {
  promise: Promise<string | undefined>;
  component: {
    handleInput(d: string): void;
    render(w: number): string[];
    children: unknown[];
  };
} {
  const kb = getKeybindings();
  let captured: unknown;
  const ui = {
    custom: (factory: (...a: unknown[]) => unknown) =>
      new Promise<string | undefined>((resolve) => {
        captured = factory(tui, theme, kb, (r: string | undefined) =>
          resolve(r),
        );
      }),
  };
  const c = { ui } as unknown as ExtensionContext;
  const promise = selectStagedOption(c, title, options, opts);
  // La fábrica se ejecuta de forma síncrona dentro de `ui.custom(...)` antes
  // de que `selectStagedOption` suspenda en su `await`, así que `captured`
  // ya está asignado al retornar aquí.
  return { promise, component: captured as never };
}

const seq = (n: number, prefix = "provider/model"): StagedOption[] =>
  Array.from({ length: n }, (_, i) => ({
    value: `${prefix}-${i}`,
    label: `${prefix}-${i}`,
  }));

const hasInput = (children: unknown[]) =>
  children.some((ch) => ch instanceof Input);

test("C2: buscador ausente con 10 opciones, presente con 11", async () => {
  const ten = open("Modelo", seq(10), { searchable: true });
  assert.equal(hasInput(ten.component.children), false);
  ten.component.handleInput(ESC);
  assert.equal(await ten.promise, undefined);

  const eleven = open("Modelo", seq(11), { searchable: true });
  assert.equal(hasInput(eleven.component.children), true);
  eleven.component.handleInput(ESC);
  assert.equal(await eleven.promise, undefined);
});

test("C5: searchable:false nunca añade buscador, ni con >10 opciones", async () => {
  const s = open("Effort", seq(15), { searchable: false });
  assert.equal(hasInput(s.component.children), false);
  s.component.handleInput(ENTER);
  assert.equal(await s.promise, "provider/model-0");
});

test("C1: viewport de 10 pero toda opción alcanzable y confirmable", async () => {
  const s = open("Modelo", seq(15), { searchable: true });
  // Recorrer hasta el último (índice 14) con DOWN y confirmar.
  for (let i = 0; i < 14; i++) s.component.handleInput(DOWN);
  const out = s.component.render(60).join("\n");
  assert.match(out, /provider\/model-14/); // alcanzable en viewport con scroll
  s.component.handleInput(ENTER);
  assert.equal(await s.promise, "provider/model-14");
});

test("C3/C4: subcadena case-insensitive (no prefijo) devuelve value limpio", async () => {
  const s = open("Modelo", seq(11), { searchable: true });
  for (const ch of "del-7") s.component.handleInput(ch); // subcadena central, mayúsculas abajo
  s.component.handleInput(ENTER);
  assert.equal(await s.promise, "provider/model-7");
});

test("C3: mayúsculas/minúsculas y restauración al borrar el filtro", async () => {
  const s = open("Modelo", seq(11), { searchable: true });
  for (const ch of "PROVIDER/MODEL-9") s.component.handleInput(ch);
  let out = s.component.render(60).join("\n");
  assert.match(out, /provider\/model-9/);
  assert.doesNotMatch(out, /provider\/model-0(?!\d)/); // filtrado activo
  for (let i = 0; i < "PROVIDER/MODEL-9".length; i++)
    s.component.handleInput(BACKSPACE);
  out = s.component.render(60).join("\n");
  // Lista completa restaurada: vuelve a verse model-0 en el viewport inicial.
  assert.match(out, /provider\/model-0(?!\d)/);
  s.component.handleInput(ESC);
  assert.equal(await s.promise, undefined);
});

test("C7: cero coincidencias muestra estado, Enter no resuelve, Escape cancela", async () => {
  const s = open("Modelo", seq(11), { searchable: true });
  for (const ch of "zzzzz") s.component.handleInput(ch);
  const out = s.component.render(60).join("\n");
  assert.match(out, /Sin coincidencias/);
  s.component.handleInput(ENTER); // no debe resolver valor
  s.component.handleInput(ESC);
  assert.equal(await s.promise, undefined);
});

test("C6: lista vacía muestra 'Sin opciones', Enter no resuelve", async () => {
  const s = open("Agente", [], { searchable: true });
  const out = s.component.render(60).join("\n");
  assert.match(out, /Sin opciones/);
  s.component.handleInput(ENTER);
  s.component.handleInput(ESC);
  assert.equal(await s.promise, undefined);
});

test("C8: Escape cancela en cualquier momento sin mutar", async () => {
  const s = open("Modelo", seq(11), { searchable: true });
  s.component.handleInput(DOWN);
  s.component.handleInput(ESC);
  assert.equal(await s.promise, undefined);
});

test("C4/borde: buscar por la parte decorada (modelo) de un agente devuelve el nombre del agente", async () => {
  const options: StagedOption[] = seq(11, "agent");
  // Opción decorada: etiqueta con modelo, valor = nombre de agente.
  options[0] = { value: "lsar-arch", label: "lsar-arch — openai/gpt-x" };
  const s = open("Agente", options, { searchable: true });
  for (const ch of "gpt-x") s.component.handleInput(ch); // coincide solo el modelo del label
  s.component.handleInput(ENTER);
  assert.equal(await s.promise, "lsar-arch"); // value limpio, no el modelo
});

test("C11: marcar el modelo actual no altera el foco inicial (Enter inmediato = primera opción)", async () => {
  const models: StagedOption[] = [
    { value: "a/x", label: "a/x" },
    { value: "b/y", label: "b/y" },
    { value: "c/z", label: "c/z (actual)" },
  ];
  const s = open("Modelo", models, { searchable: false });
  const out = s.component.render(60).join("\n");
  assert.match(out, /c\/z \(actual\)/); // presente como etiqueta
  s.component.handleInput(ENTER); // foco inicial sigue siendo la primera fila
  assert.equal(await s.promise, "a/x");
});

test("C13: ausencia de ui.custom lanza error explícito", async () => {
  const c = { ui: {} } as unknown as ExtensionContext;
  await assert.rejects(
    () => selectStagedOption(c, "Modelo", seq(11), { searchable: true }),
    /no está disponible/,
  );
});

test("C13: stub que ignora la fábrica (rpc) lanza error, no cancela en silencio", async () => {
  const ui = { custom: async () => undefined };
  const c = { ui } as unknown as ExtensionContext;
  await assert.rejects(
    () => selectStagedOption(c, "Modelo", seq(11), { searchable: true }),
    /no está disponible/,
  );
});
