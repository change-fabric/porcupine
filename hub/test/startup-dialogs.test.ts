import { describe, expect, it, vi } from "vitest";
import startupDialogs, { guardUi, stdinReady, type Api, type Ctx, type Ui } from "../src/extension/startup-dialogs.js";

function fakeUi(): Ui & { notify: ReturnType<typeof vi.fn> } {
  return {
    select: vi.fn(() => Promise.resolve("picked")),
    confirm: vi.fn(() => Promise.resolve(true)),
    input: vi.fn(() => Promise.resolve("typed")),
    editor: vi.fn(() => Promise.resolve("edited")),
    notify: vi.fn(),
  };
}

describe("startup dialog guard", () => {
  it("cancels dialogs while stdin is not flowing", async () => {
    const ui = fakeUi();
    guardUi(ui, () => false);
    await expect(ui.select?.("Merge mode", ["a"])).resolves.toBeUndefined();
    await expect(ui.confirm?.("Sure?", "")).resolves.toBe(false);
    await expect(ui.input?.("Name")).resolves.toBeUndefined();
    await expect(ui.editor?.("Edit")).resolves.toBeUndefined();
    expect(ui.notify).toHaveBeenCalledTimes(4);
    expect(ui.notify.mock.calls[0]?.[0]).toContain('"Merge mode"');
  });

  it("passes dialogs through once stdin flows", async () => {
    const ui = fakeUi();
    let ready = false;
    guardUi(ui, () => ready);
    ready = true;
    await expect(ui.select?.("Merge mode", ["a"])).resolves.toBe("picked");
    expect(ui.notify).not.toHaveBeenCalled();
  });

  it("wraps a context only once", async () => {
    const ui = fakeUi();
    guardUi(ui, () => false);
    guardUi(ui, () => true);
    await expect(ui.select?.("t", [])).resolves.toBeUndefined();
    expect(ui.notify).toHaveBeenCalledTimes(1);
  });

  it("reads readiness from stdin flowing mode", () => {
    expect(stdinReady({ readableFlowing: null })).toBe(false);
    expect(stdinReady({ readableFlowing: false })).toBe(false);
    expect(stdinReady({ readableFlowing: true })).toBe(true);
  });

  it("guards the context on session_start", () => {
    let handler: ((event: unknown, ctx: Ctx) => void) | undefined;
    const api: Api = { on: (_e, h) => (handler = h) };
    startupDialogs(api);
    const ui = fakeUi();
    const original = ui.select;
    handler?.({}, { ui });
    expect(ui.select).not.toBe(original);
  });
});
