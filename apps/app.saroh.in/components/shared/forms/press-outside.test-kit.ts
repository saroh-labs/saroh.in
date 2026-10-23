import { act } from "react";

/**
 * A press on the page behind an open sheet or dialog, as a stray tap is:
 * the pointer goes down and comes up on the page, which is what the
 * dialog's dismiss layer listens for. For component tests only.
 */
export async function pressOutside() {
    // The layer starts listening a tick after it opens, so that the press
    // which opened it isn't taken for one outside it.
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
        const at = document.body;
        at.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        at.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
        at.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}
