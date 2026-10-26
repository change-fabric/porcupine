/**
 * Pi extension: cancel extension dialogs that open before pi reads stdin.
 *
 * In rpc mode pi runs session_start handlers (pi 0.99.1 and 1.4.0,
 * modes/rpc/rpc-mode.js) before it attaches its stdin reader. A dialog opened
 * there can never receive its extension_ui_response: pi either waits forever
 * or, with nothing else holding the event loop, exits 0 with no error. Any
 * third-party extension that asks a question on startup (cf-hooks' merge mode
 * prompt, for one) takes the whole session down.
 *
 * This extension must load first. On every session_start it wraps the shared
 * UI context so select, confirm, input and editor resolve as cancelled while
 * stdin is not yet flowing, and notifies what it skipped. Once pi reads stdin
 * the wrapper passes through, so dialogs from commands and tools are untouched.
 *
 * Carries its own minimal types; pi resolves nothing from this file.
 */

type Dialog = (...args: unknown[]) => Promise<unknown>;
export interface Ui {
  select?: Dialog;
  confirm?: Dialog;
  input?: Dialog;
  editor?: Dialog;
  notify?(message: string, type?: "info" | "warning" | "error"): void;
}
export interface Ctx {
  ui?: Ui;
}
export interface Api {
  on(event: "session_start", handler: (event: unknown, ctx: Ctx) => void): unknown;
}

const DIALOGS = ["select", "confirm", "input", "editor"] as const;
/** Value each dialog resolves to when cancelled, matching pi's rpc defaults. */
const CANCELLED: Record<(typeof DIALOGS)[number], unknown> = {
  select: undefined,
  confirm: false,
  input: undefined,
  editor: undefined,
};

/** pi rebuilds the UI context on each session rebind; wrap each one once. */
const guarded = new WeakSet<Ui>();

/** True once pi's rpc line reader has put stdin into flowing mode. */
export function stdinReady(stdin: { readableFlowing: boolean | null } = process.stdin): boolean {
  return stdin.readableFlowing === true;
}

export function guardUi(ui: Ui, ready: () => boolean = () => stdinReady()): void {
  if (guarded.has(ui)) return;
  guarded.add(ui);
  for (const method of DIALOGS) {
    const original = ui[method];
    if (typeof original !== "function") continue;
    ui[method] = (...args: unknown[]) => {
      if (ready()) return original.apply(ui, args);
      const title = typeof args[0] === "string" ? args[0] : "";
      ui.notify?.(`porcupine: ${method} "${title}" cancelled; pi cannot answer dialogs during startup`, "warning");
      return Promise.resolve(CANCELLED[method]);
    };
  }
}

export default function startupDialogs(pi: Api): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.ui) guardUi(ctx.ui);
  });
}
