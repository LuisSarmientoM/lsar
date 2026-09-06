// Selector reutilizable para el editor staged de perfiles de subagentes.
//
// Contrato (spec C1–C8, C13): recibe la lista fuente ya ordenada de
// opciones `{ value, label }`, NO la reordena, y devuelve `string | undefined`
// donde el `string` es siempre un `value` de la entrada (jamás el texto del
// buscador ni la etiqueta decorada). `undefined` representa cancelación o
// ausencia de selección válida (lista vacía, cero coincidencias, Escape).
//
// Composición UI siguiendo el patrón ya presente en el stack
// (`@earendil-works/pi-coding-agent` → `extensions/llama/ui.js`,
// `HuggingFaceSearch`): `Container` + `Text` + `Input` + `SelectList` de
// `@earendil-works/pi-tui`, con viewport acotado y filtrado externo por
// subcadena case-insensitive sobre la etiqueta visible (no `SelectList.setFilter`,
// que solo hace prefijo).
import {
  Container,
  Input,
  SelectList,
  Text,
  type SelectItem,
} from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";
import type {
  ExtensionContext,
  KeybindingsManager,
  Theme,
} from "@earendil-works/pi-coding-agent";

export type StagedOption = { value: string; label: string };

// Viewport máximo de filas simultáneas; buscador solo cuando la lista supera
// esta frontera estricta (C1, C2).
const MAX_VISIBLE = 10;

export type SelectStagedOptionOptions = {
  /**
   * Selector "buscable" por tipo (Modelo/Agente). El buscador se renderiza
   * solo si además hay más de MAX_VISIBLE opciones (C2, C5).
   */
  searchable?: boolean;
};

function selectTheme(theme: Theme) {
  const fg = (color: Parameters<Theme["fg"]>[0], text: string): string =>
    typeof theme?.fg === "function" ? theme.fg(color, text) : text;
  return {
    selectedPrefix: (text: string) => fg("accent", text),
    selectedText: (text: string) => fg("accent", text),
    description: (text: string) => fg("muted", text),
    scrollInfo: (text: string) => fg("dim", text),
    noMatch: (text: string) => fg("warning", text),
  };
}

/**
 * Componente focalizable que owns la selección y enruta la entrada. Es una
 * caja negra para `SelectList` (que se usa solo como renderizador), de modo
 * que el valor confirmado proviene del índice propio, nunca de teclas crudas.
 */
class StagedSelector extends Container {
  private tui: TUI;
  private theme: Theme;
  private keybindings: KeybindingsManager;
  private source: StagedOption[];
  private searchable: boolean;
  private done: (result: string | undefined) => void;

  private input = new Input();
  private listBox = new Container();
  private query = "";
  private idx = 0;
  private closed = false;
  private _focused = false;

  constructor(
    tui: TUI,
    theme: Theme,
    keybindings: KeybindingsManager,
    title: string,
    source: StagedOption[],
    searchable: boolean,
    done: (result: string | undefined) => void,
  ) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.keybindings = keybindings;
    this.source = source;
    this.searchable = searchable;
    this.done = done;

    const titleText =
      typeof theme?.bold === "function" ? theme.bold(title) : title;
    this.addChild(new Text(this.paint("accent", titleText), 1, 0));
    if (this.showSearch) this.addChild(this.input);
    this.addChild(this.listBox);
    this.refresh();
  }

  // El buscador aparece SOLO si el selector es buscable y la lista fuente
  // supera la frontera de MAX_VISIBLE (frontera estricta 10/11; C2, C5).
  private get showSearch(): boolean {
    return this.searchable && this.source.length > MAX_VISIBLE;
  }

  private paint(
    color: Parameters<Theme["fg"]>[0],
    text: string,
  ): string {
    return typeof this.theme?.fg === "function"
      ? this.theme.fg(color, text)
      : text;
  }

  // Filtrado externo por subcadena case-insensitive sobre la etiqueta visible
  // (D1/C3), preservando el orden de la fuente.
  private visible(): StagedOption[] {
    if (!this.showSearch || !this.query) return this.source;
    const q = this.query.toLocaleLowerCase();
    return this.source.filter((o) =>
      o.label.toLocaleLowerCase().includes(q),
    );
  }

  private refresh(): void {
    this.listBox.clear();
    const opts = this.visible();
    if (this.source.length === 0) {
      this.listBox.addChild(
        new Text(this.paint("warning", "  Sin opciones disponibles"), 0, 0),
      );
    } else if (opts.length === 0) {
      this.listBox.addChild(
        new Text(this.paint("warning", "  Sin coincidencias"), 0, 0),
      );
    } else {
      if (this.idx >= opts.length) this.idx = opts.length - 1;
      if (this.idx < 0) this.idx = 0;
      const items: SelectItem[] = opts.map((o) => ({
        value: o.value,
        label: o.label,
      }));
      const maxVisible = Math.min(opts.length, MAX_VISIBLE);
      const list = new SelectList(items, maxVisible, selectTheme(this.theme));
      list.setSelectedIndex(this.idx);
      this.listBox.addChild(list);
    }
    this.listBox.invalidate();
    this.tui?.requestRender?.();
  }

  // Foco propagado al `Input` para que el TUI posicione el cursor.
  get focused(): boolean {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    if (this.showSearch) this.input.focused = value;
  }

  private close(result: string | undefined): void {
    if (this.closed) return;
    this.closed = true;
    this.done(result);
  }

  handleInput(data: string): void {
    const kb = this.keybindings;
    const opts = this.visible();

    if (kb.matches(data, "tui.select.up")) {
      if (opts.length > 0) {
        this.idx = this.idx === 0 ? opts.length - 1 : this.idx - 1;
        this.refresh();
      }
      return;
    }
    if (kb.matches(data, "tui.select.down")) {
      if (opts.length > 0) {
        this.idx = this.idx === opts.length - 1 ? 0 : this.idx + 1;
        this.refresh();
      }
      return;
    }
    if (kb.matches(data, "tui.select.confirm")) {
      // Sin opciones o sin coincidencias: no se resuelve valor (C6, C7).
      const chosen = opts[this.idx];
      if (chosen) this.close(chosen.value);
      return;
    }
    if (kb.matches(data, "tui.select.cancel")) {
      this.close(undefined);
      return;
    }
    if (this.showSearch) {
      const before = this.input.getValue();
      this.input.handleInput(data);
      const next = this.input.getValue();
      if (next !== before) {
        this.query = next;
        this.idx = 0;
        this.refresh();
      }
    }
  }
}

/**
 * Abre el selector custom sobre `ctx.ui.custom()`. Lanza un error contextual si
 * la UI custom no está disponible o el host la ignora (stub que resuelve sin
 * invocar la fábrica), sin degradar silenciosamente a `c.ui.select()` (C13).
 */
export async function selectStagedOption(
  c: ExtensionContext,
  title: string,
  options: StagedOption[],
  opts?: SelectStagedOptionOptions,
): Promise<string | undefined> {
  const ui = c?.ui;
  if (!ui || typeof ui.custom !== "function") {
    throw new Error(
      "La interfaz de selección interactiva no está disponible en este entorno.",
    );
  }

  const searchable = opts?.searchable === true;
  let invoked = false;
  const result = await ui.custom<string | undefined>(
    (
      tui: TUI,
      theme: Theme,
      keybindings: KeybindingsManager,
      done: (result: string | undefined) => void,
    ) => {
      invoked = true;
      return new StagedSelector(
        tui,
        theme,
        keybindings,
        title,
        options,
        searchable,
        done,
      );
    },
  );

  // Stub de modo sin UI custom real (p. ej. rpc): resuelve sin invocar la
  // fábrica → se trata como indisponible, no como cancelación válida.
  if (!invoked) {
    throw new Error(
      "La interfaz de selección interactiva no está disponible en este entorno.",
    );
  }
  return result;
}

