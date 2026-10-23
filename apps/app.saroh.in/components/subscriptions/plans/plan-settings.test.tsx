// @vitest-environment jsdom
/**
 * "Settings for every plan", under the Plans list (Subscriptions audit, 12
 * Oct 2026): "Members can pause from their account" as a read-first row.
 * Edit opens its sheet, where the switch takes effect as it is flipped,
 * with a toast and Undo. The row shows only once customers have an account
 * on the site, and has no Edit without `subscription:write`. ("When
 * autopay charges" is in `autopay-timing-setting.test.tsx`.)
 *
 * `react-dom/client` + `act` directly, as the editor's tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SubscriptionSettings } from "@/lib/subscriptions/service";

import { PlanSettings } from "./plan-settings";

const actions = vi.hoisted(() => ({
    setAutopayChargeTiming: vi.fn(),
    setMembersCanPause: vi.fn(),
}));
vi.mock("@/lib/subscriptions/actions", () => actions);
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
    // `runAction` passes Next's own interrupts on; a plain failure is not one.
    unstable_rethrow: () => undefined,
}));
const toast = vi.hoisted(() => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

const NOW = "2026-09-29T10:00:00Z";

const settings = (
    over: Partial<SubscriptionSettings> = {},
): SubscriptionSettings => ({
    membersCanPause: true,
    accountArea: true,
    autopay: null,
    ...over,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    actions.setMembersCanPause.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
});

function draw(s: SubscriptionSettings | null = settings(), canWrite = true) {
    act(() =>
        root.render(
            <PlanSettings settings={s} canWrite={canWrite} nowIso={NOW} />,
        ),
    );
}

async function press(el: HTMLElement | null | undefined) {
    if (!el) throw new Error("Nothing to press");
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 20));
    });
}

const sheet = () => document.body.querySelector<HTMLElement>("[role=dialog]");
function button(name: string, within: ParentNode | null = host) {
    const hit = Array.from(within?.querySelectorAll("button") ?? []).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
    if (!hit) throw new Error(`No "${name}" button`);
    return hit;
}
const row = () => host.querySelector('[data-setting="pause"]')?.textContent;
const flip = () => sheet()?.querySelector<HTMLButtonElement>('[role="switch"]');

describe("Settings for every plan", () => {
    it("is a titled group of rows: a label, what is saved, and Edit", () => {
        draw(
            settings({
                autopay: {
                    available: true,
                    chargeTiming: "DAY_AFTER_RENEWAL",
                    leadDays: 2,
                    noticeHours: 26,
                    dueDays: 7,
                },
            }),
        );
        expect(host.querySelector("h2#plan-settings")?.textContent).toBe(
            "Settings for every plan",
        );
        expect(host.textContent).toContain(
            "Set once for the whole business. Each one saves on its own.",
        );
        expect(
            Array.from(host.querySelectorAll("[data-setting]")).map((el) =>
                el.getAttribute("data-setting"),
            ),
        ).toEqual(["pause", "timing"]);
        expect(
            Array.from(host.querySelectorAll("button")).map((b) =>
                b.getAttribute("aria-label"),
            ),
        ).toEqual([
            "Edit: Members can pause from their account",
            "Edit: When autopay charges",
        ]);
        // Read first: no switch and no cards on the page itself.
        expect(host.querySelector('[role="switch"]')).toBeNull();
        expect(host.querySelector('input[type="radio"]')).toBeNull();
    });

    it("draws nothing when the settings are unread, or neither applies", () => {
        draw(null);
        expect(host.textContent).toBe("");
        draw(settings({ accountArea: false }));
        expect(host.textContent).toBe("");
    });
});

describe("Members can pause from their account", () => {
    it("reads yes or no in a sentence", () => {
        draw();
        expect(host.textContent).toContain(
            "Members can pause from their account",
        );
        expect(row()).toBe("Yes, for 2, 4 or 8 weeks.");
        draw(settings({ membersCanPause: false }));
        expect(row()).toBe(
            "No. You can still pause anyone from their subscription.",
        );
    });

    it("shows only once customers have an account on the site", () => {
        draw(settings({ accountArea: false }));
        expect(host.querySelector('[data-setting="pause"]')).toBeNull();
    });

    it("Edit opens its sheet, with the switch and what it means", async () => {
        draw();
        await press(button("Edit: Members can pause from their account"));
        expect(sheet()?.textContent).toContain(
            "People on a plan can pause it for 2, 4 or 8 weeks from their account on your website.",
        );
        expect(flip()?.getAttribute("aria-checked")).toBe("true");
        // The switch is named by its words and described by the line.
        const hint = flip()?.getAttribute("aria-describedby") ?? "";
        expect(document.getElementById(hint)?.textContent).toContain(
            "Nothing is charged while it's paused.",
        );
        expect(
            sheet()?.querySelector(`label[for="${flip()?.id ?? ""}"]`)
                ?.textContent,
        ).toBe("Members can pause from their account");
        // Nothing waits for a Save: the foot is one Done.
        expect(button("Done", sheet())).toBeTruthy();
    });

    it("the switch saves as it is flipped, with a toast and Undo", async () => {
        draw();
        await press(button("Edit: Members can pause from their account"));
        await press(flip());
        expect(actions.setMembersCanPause).toHaveBeenCalledWith(false);
        expect(flip()?.getAttribute("aria-checked")).toBe("false");
        expect(row()).toBe(
            "No. You can still pause anyone from their subscription.",
        );
        expect(refresh).toHaveBeenCalled();
        const [said, undo] = toast.showUndo.mock.calls[0] as [
            string,
            () => Promise<unknown>,
        ];
        expect(said).toBe("Members can no longer pause from their account.");

        // Undo puts back what it was.
        await act(async () => {
            await expect(undo()).resolves.toEqual({ ok: true });
        });
        expect(actions.setMembersCanPause).toHaveBeenLastCalledWith(true);
        expect(row()).toBe("Yes, for 2, 4 or 8 weeks.");
        expect(flip()?.getAttribute("aria-checked")).toBe("true");
    });

    it("a refusal puts the switch back and says why", async () => {
        actions.setMembersCanPause.mockResolvedValue({
            ok: false,
            error: "Couldn't save that. Try again.",
        });
        draw();
        await press(button("Edit: Members can pause from their account"));
        await press(flip());
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't save that. Try again.",
        );
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(flip()?.getAttribute("aria-checked")).toBe("true");
        expect(row()).toBe("Yes, for 2, 4 or 8 weeks.");
    });

    it("can't be changed without the capability: the row reads, with no Edit", () => {
        draw(settings(), false);
        expect(row()).toBe("Yes, for 2, 4 or 8 weeks.");
        expect(host.querySelectorAll("button")).toHaveLength(0);
        expect(host.textContent).toContain(
            "Only someone who can change subscriptions can change these.",
        );
    });
});
