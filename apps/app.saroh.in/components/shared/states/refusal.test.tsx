// @vitest-environment jsdom
/**
 * Why a save didn't go through, inside the overlay that is still open: a
 * refusal by role is a quiet note, never the red alert a breakage gets.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfirmDialog } from "@/components/shared/confirm/confirm-dialog";
import { roleDeniedSentence } from "@/lib/api/role-denied";
import { Refusal } from "./refusal";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const DENIED = roleDeniedSentence("member:remove");

describe("Refusal", () => {
    it("draws nothing for nothing", () => {
        act(() => root.render(<Refusal>{null}</Refusal>));
        expect(host.innerHTML).toBe("");
        act(() => root.render(<Refusal>{"  "}</Refusal>));
        expect(host.innerHTML).toBe("");
    });

    it("says a refusal by role as a note, not an alert", () => {
        act(() => root.render(<Refusal>{DENIED}</Refusal>));
        expect(host.querySelector("[role=alert]")).toBe(null);
        const note = host.querySelector("[role=note]");
        expect(note?.textContent).toBe(
            "Your role can't remove people. An owner or admin can change this in Settings › Team.",
        );
    });

    it("says the API's own wording of one the same way", () => {
        act(() =>
            root.render(
                <Refusal>Your role changes only your own bookings.</Refusal>,
            ),
        );
        expect(host.querySelector("[role=alert]")).toBe(null);
        expect(host.querySelector("[role=note]")).not.toBe(null);
    });

    it("says anything else as the error it is", () => {
        act(() => root.render(<Refusal>That time was just taken.</Refusal>));
        expect(host.querySelector("[role=alert]")?.textContent).toBe(
            "That time was just taken.",
        );
    });
});

describe("a confirm refused by role", () => {
    const tick = () =>
        act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });

    it("stays open and says it as a note, with no alert", async () => {
        act(() =>
            root.render(
                <ConfirmDialog
                    open
                    onOpenChange={() => undefined}
                    title="Remove Ravi?"
                    description="They lose access. This cannot be undone."
                    confirmLabel="Remove Ravi"
                    keepLabel="Keep Ravi"
                    onConfirm={() => ({ ok: false, error: DENIED })}
                />,
            ),
        );
        await tick();
        const dialog = document.body.querySelector("[role=alertdialog]");
        const confirm = Array.from(
            dialog?.querySelectorAll("button") ?? [],
        ).find((b) => b.textContent.trim() === "Remove Ravi");
        await act(async () => {
            confirm?.click();
            await Promise.resolve();
        });
        await tick();
        const open = document.body.querySelector("[role=alertdialog]");
        expect(open).not.toBe(null);
        expect(open?.querySelector("[role=alert]")).toBe(null);
        expect(open?.querySelector("[role=note]")?.textContent).toBe(DENIED);
    });
});
