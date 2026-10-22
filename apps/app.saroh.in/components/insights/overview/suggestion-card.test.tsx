// @vitest-environment jsdom
/**
 * Insights' "What to do next" (DEC-171, plan U11, #1091): each rule's
 * suggestion, Next suggestion wrapping round, Not now with its toast and
 * Undo (the API's POST and DELETE), the last one gone (`IBNoSuggD`), the
 * first sale (`IBNoSalesD`), a role without payments (`IBMemberD`), a read
 * that failed (`IBFailedD`), and the order a keyboard and a screen reader
 * meet it in.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SourceRead } from "@/lib/analytics/takings";
import type { SuggestionsRead } from "@/lib/insights/reads";
import {
    CLASS_FULL,
    FIRST_SALE,
    LATE_BILL,
    SELLING_LESS,
    suggestionsRead,
} from "@/lib/insights/suggestions.fixture";
import type { ShareLink } from "@/lib/sites/share-links";

import { SuggestionCard } from "./suggestion-card";

const toast = vi.hoisted(() => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showWarning: vi.fn(),
    showUndo: vi.fn(),
    dismissToast: vi.fn(),
    settleUndo: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

const actions = vi.hoisted(() => ({
    putOffSuggestion: vi.fn(),
    bringBackSuggestion: vi.fn(),
}));
vi.mock("@/lib/insights/suggestion-actions", () => actions);

const remind = vi.hoisted(() => ({ remindWithLink: vi.fn() }));
vi.mock("@/lib/invoices/link-actions", () => remind);

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.clearAllMocks();
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.useRealTimers();
});

const settle = () => new Promise((r) => setTimeout(r, 0));

function render(
    read: SourceRead<SuggestionsRead> | null = {
        status: "ok",
        data: suggestionsRead(),
    },
    share: ShareLink | null = null,
) {
    act(() => root.render(<SuggestionCard read={read} share={share} />));
}

const text = () => host.textContent;
const title = () =>
    host.querySelector("[data-testid=suggestion-title]")?.textContent;
const place = () =>
    host.querySelector("[data-testid=suggestion-place]")?.textContent;
const button = (label: string) =>
    Array.from(host.querySelectorAll<HTMLElement>("button, a")).find(
        (b) => b.textContent.trim() === label,
    ) ?? null;

async function press(label: string) {
    const b = button(label);
    if (!b) throw new Error(`No ${label}`);
    await act(async () => {
        b.click();
        await settle();
    });
}

describe("each suggestion", () => {
    it("a class nearly always full: its words, button and rule (`IBOverviewD`)", () => {
        render();
        expect(text()).toContain("What to do next");
        expect(place()).toBe("1 of 3");
        expect(title()).toBe("Add another time for Saturday sourdough class");
        expect(button("Add a class time")?.getAttribute("href")).toBe(
            "/services/svc_1",
        );
        expect(text()).toContain(
            "Why you're seeing this: a class nearly always full.",
        );
        expect(button("Next suggestion")).not.toBeNull();
        expect(button("Not now")).not.toBeNull();
    });

    it("a late bill: Send reminder waits ten seconds with Undo, then says who was told", async () => {
        remind.remindWithLink.mockResolvedValue({
            ok: true,
            data: {
                channels: ["email"],
                email: { status: "QUEUED", to: "shruti@example.com" },
                thread: false,
            },
        });
        render({
            status: "ok",
            data: suggestionsRead({ suggestions: [LATE_BILL] }),
        });
        expect(title()).toBe("Remind Shruti Menon about ₹11,250");
        vi.useFakeTimers();
        act(() => {
            button("Send reminder")?.click();
        });
        // Held: nothing sent yet, the toast offers Undo.
        expect(remind.remindWithLink).not.toHaveBeenCalled();
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Sending in 10 seconds",
            expect.any(Function),
            expect.anything(),
        );
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(remind.remindWithLink).toHaveBeenCalledWith("inv_1");
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Reminder sent to shruti@example.com with a payment link.",
            undefined,
        );
        expect(button("Reminder sent")?.hasAttribute("disabled")).toBe(true);
    });

    it("something selling less opens the product (`IBNotNowD`)", () => {
        render({
            status: "ok",
            data: suggestionsRead({ suggestions: [SELLING_LESS] }),
        });
        expect(title()).toBe("Croissants, box of 4 is selling less");
        expect(button("Open the product")?.getAttribute("href")).toBe(
            "/commerce/products/prd_1",
        );
        // One alone: no count and no Next.
        expect(place()).toBeUndefined();
        expect(button("Next suggestion")).toBeNull();
    });

    it("the first sale copies the shop link and can't be put off (`IBNoSalesD`)", () => {
        render(
            {
                status: "ok",
                data: suggestionsRead({
                    hasSales: false,
                    suggestions: [FIRST_SALE],
                }),
            },
            {
                kind: "shop",
                url: "https://rye.saroh.app/shop",
                label: "Share your online shop",
                copied: "Online shop link copied",
            },
        );
        expect(title()).toBe(
            "Send your shop link to 10 people who already buy from you",
        );
        expect(button("Copy shop link")).not.toBeNull();
        expect(button("Not now")).toBeNull();
        expect(text()).not.toContain("Why you're seeing this");
    });
});

describe("Next suggestion", () => {
    it("moves on and wraps round to the first", async () => {
        render();
        await press("Next suggestion");
        expect(place()).toBe("2 of 3");
        expect(title()).toBe("Remind Shruti Menon about ₹11,250");
        await press("Next suggestion");
        expect(place()).toBe("3 of 3");
        await press("Next suggestion");
        expect(place()).toBe("1 of 3");
        expect(title()).toBe("Add another time for Saturday sourdough class");
    });
});

describe("Not now", () => {
    it("hides it for 7 days with a toast, and Undo brings it back where it was", async () => {
        actions.putOffSuggestion.mockResolvedValue({
            ok: true,
            data: { key: CLASS_FULL.key, hiddenUntil: "2026-10-27" },
        });
        actions.bringBackSuggestion.mockResolvedValue({ ok: true, data: {} });
        render();
        await press("Not now");
        expect(actions.putOffSuggestion).toHaveBeenCalledWith(
            "class-full:svc_1",
        );
        expect(place()).toBe("1 of 2");
        expect(title()).toBe("Remind Shruti Menon about ₹11,250");
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Hidden for 7 days.",
            expect.any(Function),
        );
        // Focus goes to the card's name, never lost with the button.
        expect(document.activeElement?.id).toBe("suggestion-heading");

        const undo = toast.showUndo.mock.calls[0][1] as () => Promise<{
            ok: boolean;
        }>;
        let res: { ok: boolean } | undefined;
        await act(async () => {
            res = await undo();
        });
        expect(actions.bringBackSuggestion).toHaveBeenCalledWith(
            "class-full:svc_1",
        );
        expect(res?.ok).toBe(true);
        expect(place()).toBe("1 of 3");
        expect(title()).toBe("Add another time for Saturday sourdough class");
    });

    it("says a refusal and keeps the suggestion", async () => {
        actions.putOffSuggestion.mockResolvedValue({
            ok: false,
            error: "Couldn't hide that suggestion.",
        });
        render();
        await press("Not now");
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't hide that suggestion.",
        );
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(place()).toBe("1 of 3");
    });

    it("the last one gone leaves one quiet line, no card (`IBNoSuggD`)", async () => {
        actions.putOffSuggestion.mockResolvedValue({
            ok: true,
            data: { key: SELLING_LESS.key, hiddenUntil: "2026-10-27" },
        });
        render({
            status: "ok",
            data: suggestionsRead({ suggestions: [SELLING_LESS] }),
        });
        await press("Not now");
        expect(title()).toBeUndefined();
        expect(text()).toContain("Nothing to suggest right now.");
        expect(text()).toContain(
            "a class is nearly always full, a bill is more than 3 weeks late, or something sells less than before.",
        );
        expect(document.activeElement?.id).toBe("suggestion-none");
    });
});

describe("for each person, and when the read fails", () => {
    it("a role without payments is told money suggestions aren't theirs (`IBMemberD`)", () => {
        render({
            status: "ok",
            data: suggestionsRead({ money: false, suggestions: [CLASS_FULL] }),
        });
        expect(title()).toBe("Add another time for Saturday sourdough class");
        expect(text()).toContain(
            "Suggestions about money, like late bills, show only to people who can see payments.",
        );
        expect(text()).not.toContain("₹");
        expect(button("Not now")).not.toBeNull();
    });

    it("with none at all, that role is told only the class rule", () => {
        render({
            status: "ok",
            data: suggestionsRead({ money: false, suggestions: [] }),
        });
        expect(text()).toContain(
            "Suggestions show up when a class is nearly always full.",
        );
        expect(text()).not.toContain("a bill is more than 3 weeks late");
    });

    it("a read that failed names itself, with Try again (`IBFailedD`)", () => {
        render({ status: "failed" });
        expect(text()).toContain("Couldn't load suggestions");
        expect(button("Try again")).not.toBeNull();
        expect(title()).toBeUndefined();
    });

    it("draws nothing for a role denied the read", () => {
        render({ status: "denied" });
        expect(host.innerHTML).toBe("");
    });
});

describe("keyboard and screen reader", () => {
    it("is a named region read heading, place, suggestion, then its buttons in order", () => {
        render();
        const region = host.querySelector("section");
        expect(region?.getAttribute("aria-labelledby")).toBe(
            "suggestion-heading",
        );
        expect(host.querySelector("h2")?.textContent).toBe("What to do next");
        expect(host.querySelector("[aria-live=polite]")?.textContent).toContain(
            "Add another time for Saturday sourdough class",
        );
        const tabbable = Array.from(
            host.querySelectorAll<HTMLElement>("a[href], button"),
        ).map((el) => el.textContent.trim());
        expect(tabbable).toEqual([
            "Add a class time",
            "Next suggestion",
            "Not now",
        ]);
    });
});
