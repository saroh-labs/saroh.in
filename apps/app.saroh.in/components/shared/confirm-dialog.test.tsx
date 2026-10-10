// @vitest-environment jsdom
/**
 * The one confirm: it waits for its action, says it is working, can't be
 * dismissed meanwhile, stays open with the reason on a refusal and closes
 * only on success. Red only when something is destroyed.
 */
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import {
    busyOf,
    CONFIRM_FAILED,
    ConfirmDialog,
} from "@/components/shared/confirm-dialog";

const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
}));

let root: Root;
let host: HTMLDivElement;
const closed = vi.fn();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    closed.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const dialog = () =>
    document.body.querySelector<HTMLElement>("[role=alertdialog]");
const buttons = () => Array.from(dialog()?.querySelectorAll("button") ?? []);
const button = (name: string) => {
    const hit = buttons().find((b) => b.textContent.trim() === name);
    if (!hit) throw new Error(`No "${name}" button`);
    return hit;
};
const tick = () =>
    act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
async function escape() {
    await act(async () => {
        document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        await new Promise((r) => setTimeout(r, 0));
    });
}

/** An action the test finishes when it chooses. */
function deferred() {
    let finish: (result: ConfirmResult) => void = () => undefined;
    const promise = new Promise<ConfirmResult>((resolve) => {
        finish = resolve;
    });
    return { promise, finish };
}

function Ask({
    onConfirm,
    tone,
}: {
    onConfirm: () => ConfirmResult | Promise<ConfirmResult>;
    tone?: "destructive" | "neutral";
}) {
    const [open, setOpen] = useState(true);
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={(o) => {
                if (!o) closed();
                setOpen(o);
            }}
            tone={tone}
            title="Delete Summer menu?"
            description="The page goes. Your other pages stay. This cannot be undone."
            confirmLabel="Delete page"
            keepLabel="Keep page"
            onConfirm={onConfirm}
        />
    );
}

describe("ConfirmDialog", () => {
    it("says what goes, offers Keep first and the verb second, and starts on Keep", async () => {
        act(() => root.render(<Ask onConfirm={() => undefined} />));
        await tick();
        expect(dialog()?.textContent).toContain("Delete Summer menu?");
        expect(dialog()?.textContent).toContain("This cannot be undone.");
        expect(buttons().map((b) => b.textContent.trim())).toEqual([
            "Keep page",
            "Delete page",
        ]);
        expect(document.activeElement).toBe(button("Keep page"));
    });

    it("waits for the action: a busy label, both buttons off, and nothing dismisses it", async () => {
        const work = deferred();
        const onConfirm = vi.fn(() => work.promise);
        act(() => root.render(<Ask onConfirm={onConfirm} />));
        await act(async () => {
            button("Delete page").click();
            await Promise.resolve();
        });
        expect(button("Deleting…").getAttribute("aria-busy")).toBe("true");
        expect(button("Keep page").disabled).toBe(true);
        // A second press can't run it twice.
        act(() => button("Deleting…").click());
        await escape();
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(closed).not.toHaveBeenCalled();
        expect(dialog()).not.toBe(null);

        await act(async () => {
            work.finish(undefined);
            await Promise.resolve();
        });
        expect(closed).toHaveBeenCalledTimes(1);
        expect(dialog()).toBe(null);
    });

    it("stays open with the reason when it is refused, and can be tried again", async () => {
        const onConfirm = vi
            .fn<() => Promise<ConfirmResult>>()
            .mockResolvedValueOnce({
                ok: false,
                error: "It has orders still to send.",
            })
            .mockResolvedValueOnce(true);
        act(() => root.render(<Ask onConfirm={onConfirm} />));
        await act(async () => {
            button("Delete page").click();
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(closed).not.toHaveBeenCalled();
        expect(dialog()?.querySelector("[role=alert]")?.textContent).toBe(
            "It has orders still to send.",
        );
        expect(button("Delete page").disabled).toBe(false);

        await act(async () => {
            button("Delete page").click();
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(closed).toHaveBeenCalledTimes(1);
    });

    it("says its own sentence when the action throws or gives no reason", async () => {
        const onConfirm = vi.fn(() => Promise.reject(new Error("boom")));
        act(() => root.render(<Ask onConfirm={onConfirm} />));
        await act(async () => {
            button("Delete page").click();
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(dialog()?.querySelector("[role=alert]")?.textContent).toBe(
            CONFIRM_FAILED,
        );
        expect(closed).not.toHaveBeenCalled();
    });

    it("is red only when something is destroyed", () => {
        act(() => root.render(<Ask onConfirm={() => undefined} />));
        expect(button("Delete page").className).toContain("destructive");
        act(() =>
            root.render(<Ask tone="neutral" onConfirm={() => undefined} />),
        );
        expect(button("Delete page").className).not.toContain("destructive");
    });

    it("reads the busy label from the verb", () => {
        expect(busyOf("Delete page")).toBe("Deleting…");
        expect(busyOf("Cancel order")).toBe("Cancelling…");
        expect(busyOf("Turn on Track stock")).toBe("Turning on…");
        expect(busyOf("Make a new link")).toBe("Making…");
        expect(busyOf("Frobnicate it")).toBe("Working…");
    });
});
