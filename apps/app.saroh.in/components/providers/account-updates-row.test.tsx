// @vitest-environment jsdom
/**
 * Settings › Providers' "Updates in Messages" (12 Oct 2026), read first:
 * the row says what is saved and what that leaves the customers with, and
 * is drawn only while the choice can have an effect. Edit opens a side
 * sheet with the two choices and one Save. Saved, it closes with a toast
 * and Undo, which puts the choice back. A refusal keeps it open.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stage } from "@/components/commerce/product-settings/test-kit";
import type { AccountUpdates } from "@/lib/communications/account-updates";

import { AccountUpdatesBlock } from "./account-updates-row";

const setAccountUpdates = vi.fn();
vi.mock("@/lib/communications/account-updates-actions", () => ({
    setAccountUpdates: (...a: unknown[]) => setAccountUpdates(...a) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
    unstable_rethrow: vi.fn(),
}));
const showError = vi.fn();
const showUndo = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => showError(...a) as unknown,
    showUndo: (...a: unknown[]) => showUndo(...a) as unknown,
}));
vi.mock("@saroh/ui/sheet", async () =>
    (
        await import("@/components/commerce/product-settings/test-kit")
    ).sheetMock(),
);

const state = (over: Partial<AccountUpdates> = {}): AccountUpdates => ({
    on: true,
    offered: true,
    emailConnected: true,
    ...over,
});

const s = stage();
const render = (st = state()) => s.render(<AccountUpdatesBlock state={st} />);
const EDIT = "Edit updates in Messages";

/** The radio whose row holds these words. */
function choose(words: string) {
    const row = Array.from(
        s.sheet()?.querySelectorAll<HTMLElement>("label") ?? [],
    ).find((l) => l.textContent.includes(words));
    const radio = row?.querySelector<HTMLElement>('[role="radio"]');
    if (!radio) throw new Error(`No choice "${words}"`);
    act(() => radio.click());
}
const chosen = () =>
    s
        .sheet()
        ?.querySelector('[role="radio"][aria-checked="true"]')
        ?.closest("label")?.textContent ?? null;

beforeEach(() => {
    s.mount();
    for (const m of [setAccountUpdates, refresh, showError, showUndo])
        m.mockReset();
    setAccountUpdates.mockResolvedValue({ ok: true, data: {} });
});
afterEach(() => s.unmount());

describe("the row", () => {
    it("reads first: what is saved, with Edit and nothing open", () => {
        render();
        expect(s.text()).toContain("Messages in customer accounts");
        expect(s.text()).toContain("Updates in Messages");
        expect(s.text()).toContain("On");
        expect(s.text()).toContain(
            "Saroh posts order, booking and invoice updates to your customers' Messages.",
        );
        expect(s.text()).toContain("Your emails go out as well.");
        expect(s.button(EDIT)).toBeDefined();
        expect(s.sheet()).toBe(null);
        expect(document.querySelectorAll('[role="radio"]')).toHaveLength(0);
    });

    it("off with no email provider says nothing tells the customer", () => {
        render(state({ on: false, emailConnected: false }));
        expect(s.text()).toContain("Off");
        expect(s.text()).toContain(
            "No email provider is connected, so nothing tells a customer their order is ready.",
        );
    });

    it.each([
        [
            "customers have no account yet, or Messages is off for the business",
            { offered: false },
        ],
        ["that, whatever the business chose", { offered: false, on: false }],
    ])("is not drawn when %s", (_why, over) => {
        render(state(over));
        expect(s.text()).toBe("");
        expect(s.button(EDIT)).toBeUndefined();
    });
});

describe("the sheet", () => {
    it("opens on the saved choice, with both spelled out and the email line", () => {
        render(state({ emailConnected: false }));
        s.press(EDIT);
        const sheet = s.sheet();
        expect(s.title(sheet)).toBe("Updates in Messages");
        expect(chosen()).toContain("Post updates to Messages");
        expect(sheet?.textContent).toContain("Don't post updates");
        expect(sheet?.textContent).toContain(
            "They can still write to you there, and your replies still reach them.",
        );
        expect(sheet?.textContent).toContain(
            "With updates off, you have no other way to tell a customer their order is ready.",
        );
        expect(s.button("Save", sheet)).toBeDefined();
        expect(s.button("Cancel", sheet)).toBeDefined();
    });

    it("turning it off saves, closes, and offers Undo that turns it back on", async () => {
        render();
        s.press(EDIT);
        choose("Don't post updates");
        await s.submit(s.sheet());

        expect(setAccountUpdates).toHaveBeenCalledTimes(1);
        expect(setAccountUpdates).toHaveBeenCalledWith(false);
        expect(s.sheet()).toBe(null);
        expect(refresh).toHaveBeenCalled();
        expect(showError).not.toHaveBeenCalled();
        expect(showUndo).toHaveBeenCalledTimes(1);
        const [message, undo] = showUndo.mock.calls[0] as [
            string,
            () => Promise<unknown>,
        ];
        expect(message).toBe("Updates to Messages are off.");

        await act(async () => {
            expect(await undo()).toEqual({ ok: true, data: {} });
        });
        expect(setAccountUpdates).toHaveBeenLastCalledWith(true);
    });

    it("turning it on says so", async () => {
        render(state({ on: false }));
        s.press(EDIT);
        expect(chosen()).toContain("Don't post updates");
        choose("Post updates to Messages");
        await s.submit(s.sheet());
        expect(setAccountUpdates).toHaveBeenCalledWith(true);
        expect(showUndo.mock.calls[0]?.[0]).toBe("Updates to Messages are on.");
    });

    it("Save with nothing changed just closes: nothing is sent, no toast", async () => {
        render();
        s.press(EDIT);
        await s.submit(s.sheet());
        expect(setAccountUpdates).not.toHaveBeenCalled();
        expect(showUndo).not.toHaveBeenCalled();
        expect(s.sheet()).toBe(null);
    });

    it("a refusal keeps the sheet open on what was chosen, and says why", async () => {
        setAccountUpdates.mockResolvedValue({
            ok: false,
            error: "Only an owner or admin can change this.",
        });
        render();
        s.press(EDIT);
        choose("Don't post updates");
        await s.submit(s.sheet());
        expect(showError).toHaveBeenCalledWith(
            "Only an owner or admin can change this.",
        );
        expect(showUndo).not.toHaveBeenCalled();
        expect(s.sheet()).not.toBe(null);
        expect(chosen()).toContain("Don't post updates");
    });

    it("Cancel drops the draft, and the next opening starts from what is saved", () => {
        render();
        s.press(EDIT);
        choose("Don't post updates");
        s.press("Cancel", s.sheet());
        expect(s.sheet()).toBe(null);
        expect(setAccountUpdates).not.toHaveBeenCalled();
        s.press(EDIT);
        expect(chosen()).toContain("Post updates to Messages");
    });
});
