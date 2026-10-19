/** @vitest-environment jsdom */
import type { Catalog } from "@saroh/pricing-catalog";
import { diff, formatInr } from "@saroh/pricing-catalog";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminPlanCount } from "@/lib/pricing-types";
import { fakeDraft, fakeVersion } from "@/test/pricing-fixture";

import { AUTOSAVE_MS } from "../draft-store";
import { PlansShell } from "../plans-shell";
import { tabCatalog, tabData, tabPricing } from "../plans/tab-test-kit";
import { changedOnCard } from "../sheets/card-preview";
import { draftChanges, moversLine, reachOf } from "./changes";
import { PREVIEW_HIDDEN_KEY } from "./preview-state";

const actions = vi.hoisted(() => ({
    savePricingDraftAction: vi.fn(),
    discardPricingDraftAction: vi.fn(),
    previewPricingAction: vi.fn(),
    pricingImpactAction: vi.fn(),
}));
vi.mock("@/lib/pricing-actions", () => actions);
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

/** A draft that changes a bit of everything the change log knows. */
function busyDraft(): Catalog {
    const d = tabCatalog();
    const [a, b, c] = d.plans;
    a.name = "Plan A2";
    b.pricePaise = 33_300;
    b.tagline = "A new line";
    c.retired = true;
    b.trial = { on: true, days: 7, firstPaise: 100 };
    d.plans = [b, a, c];
    const things = d.modules.find((m) => m.id === "things");
    if (!things) throw new Error("things");
    things.name = "Things2";
    things.cells.a = { ...things.cells.a, text: "22", limit: 22 } as never;
    things.cells.c = { inc: false, off: "locked" };
    const widgets = d.modules.find((m) => m.id === "widgets");
    if (widgets) {
        widgets.pricing = "hidden";
        widgets.group = "g2";
    }
    d.modules.push({
        id: "sprockets",
        name: "Sprockets",
        group: "g1",
        pricing: "show",
        what: "",
        cells: {
            b: {
                inc: true,
                text: "Included",
                card: "",
                limit: null,
                per: "",
                soft: false,
            },
        },
    });
    d.modules = [d.modules[1], d.modules[0], ...d.modules.slice(2)];
    d.yearly = { on: true, paid: 11 };
    d.gst = { show: "incl" };
    d.autopay = { charges: 24 };
    d.addons.push({
        id: "more",
        kind: "products",
        name: "More things",
        pricePaise: 1_100,
        mode: "pack",
        qty: 10,
        plans: ["b"],
        max: 3,
    });
    return d;
}

describe("the change list's model", () => {
    it("says exactly what the change log says, in its order", () => {
        const live = tabCatalog();
        const draft = busyDraft();
        const words = draftChanges(live, draft).map((c) => c.what);
        expect(words).toEqual(diff(live, draft));
        expect(words.length).toBeGreaterThan(15);
    });

    it("takes back one change with each Undo, and leaves the rest", () => {
        const live = tabCatalog();
        const draft = busyDraft();
        const before = draftChanges(live, draft);
        for (const change of before) {
            const after = structuredClone(draft);
            change.undo?.(after);
            const left = diff(live, after);
            // Switching a trial off takes its first days' price with it: that
            // line only means anything while the trial is on.
            const along = change.key === "trial:b" ? 1 : 0;
            expect(left, change.what).toHaveLength(before.length - 1 - along);
            expect(left, change.what).not.toContain(change.what);
        }
    });

    it("takes every change back to live, one Undo at a time", () => {
        const live = tabCatalog();
        const draft = busyDraft();
        for (let guard = 0; guard < 40; guard++) {
            const next = draftChanges(live, draft).at(0);
            if (!next) break;
            next.undo?.(draft);
        }
        expect(diff(live, draft)).toEqual([]);
    });

    it("gives the highlight back to the plan that had it", () => {
        const live = tabCatalog();
        const draft = tabCatalog();
        for (const p of draft.plans) p.featured = p.id === "c";
        const b = draftChanges(live, draft).find(
            (c) => c.key === "plan-card:b",
        );
        b?.undo?.(draft);
        expect(draft.plans.filter((p) => p.featured).map((p) => p.id)).toEqual([
            "b",
        ]);
    });

    it("has nothing to list for a first version", () => {
        expect(draftChanges(null, tabCatalog())).toEqual([]);
    });

    const counts: AdminPlanCount[] = [
        {
            planId: "a",
            name: "Plan A",
            retired: false,
            businesses: 2,
            olderVersion: 0,
        },
        {
            planId: "b",
            name: "Plan B",
            retired: false,
            businesses: 1,
            olderVersion: 0,
        },
    ];

    it("says who would move at renewal, by plan", () => {
        const live = tabCatalog();
        const draft = tabCatalog();
        draft.plans[1].pricePaise = 33_300;
        const changes = draftChanges(live, draft);
        expect(moversLine(changes, draft.plans, counts)).toBe(
            "1 business on Plan B would move at their renewal.",
        );
        draft.yearly = { on: false, paid: 10 };
        expect(moversLine(draftChanges(live, draft), draft.plans, counts)).toBe(
            "3 businesses on every plan would move at their renewal.",
        );
        const words = tabCatalog();
        words.plans[0].name = "Plan Z";
        expect(moversLine(draftChanges(live, words), words.plans, counts)).toBe(
            "Only the pricing page changes.",
        );
    });

    it("says who one change reaches, in the API's words when it has them", () => {
        const live = tabCatalog();
        const draft = tabCatalog();
        draft.plans[1].pricePaise = 33_300;
        const [price] = draftChanges(live, draft);
        expect(reachOf(price, counts, null)).toBe("1 business at renewal");
        expect(
            reachOf(price, counts, {
                items: [
                    {
                        tone: "warn",
                        label: "Check",
                        title: `Plan B: ${formatInr(11_100)} → ${formatInr(33_300)} a month`,
                        detail: "1 business pays more.",
                        businesses: [],
                    },
                ],
                touched: 1,
                total: 3,
                revenue: { nowPaise: 0, nextPaise: 0 },
            }),
        ).toBe("1 business pays more.");
    });

    it("marks what a plan's card changed", () => {
        const live = tabCatalog();
        const draft = tabCatalog();
        draft.plans[0].pricePaise = 1_100;
        const things = draft.modules[0];
        things.cells.a = { ...things.cells.a, card: "22 things" } as never;
        const was = changedOnCard(live, draft, "a");
        expect(was.price).toBe(true);
        expect(was.name).toBe(false);
        expect([...was.lines]).toEqual(["22 things"]);
        expect(changedOnCard(null, draft, "a").lines.size).toBe(0);
    });
});

// ── On screen ─────────────────────────────────────────────────────────────

/** A saved draft over `tabCatalog`: Plan B's price, and Things on Plan A. */
/** Live with two changes: a price and a limit. */
function changedCatalog() {
    const catalog = tabCatalog();
    catalog.plans[1].pricePaise = 33_300;
    const things = catalog.modules[0];
    things.cells.a = { ...things.cells.a, text: "22", limit: 22 } as never;
    return catalog;
}

function withDraft() {
    const catalog = changedCatalog();
    return tabData({
        pricing: tabPricing({
            draft: fakeDraft({ catalog, baseVersion: 1 }),
        }),
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    window.localStorage.clear();
    actions.pricingImpactAction.mockResolvedValue({ ok: true, data: null });
    actions.savePricingDraftAction.mockResolvedValue({
        ok: true,
        data: { revision: 4, valid: true, errors: [], changes: [] },
    });
    window.history.replaceState(null, "", "/plans");
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe("the docked live preview", () => {
    it("shows the highlighted plan's card and the draft's changes", () => {
        render(<PlansShell data={withDraft()} impact={null} tab="plans" />);
        const aside = screen.getByRole("complementary", {
            name: "Live preview",
        });
        expect(
            within(aside).getByRole("region", {
                name: "Preview of Plan B on the pricing page",
            }),
        ).toBeTruthy();
        const list = within(aside).getByRole("region", {
            name: "Changes in this draft",
        });
        expect(within(list).getAllByRole("listitem")).toHaveLength(2);

        fireEvent.click(within(aside).getByRole("button", { name: "Plan A" }));
        expect(
            within(aside).getByRole("region", {
                name: "Preview of Plan A on the pricing page",
            }),
        ).toBeTruthy();
    });

    it("takes back one change with Undo, saves it, and moves the keyboard on", async () => {
        render(<PlansShell data={withDraft()} impact={null} tab="plans" />);
        const list = screen.getByRole("region", {
            name: "Changes in this draft",
        });
        const price = `Plan B: ${formatInr(11_100)} → ${formatInr(33_300)} a month`;
        fireEvent.click(
            within(list).getByRole("button", { name: `Undo: ${price}` }),
        );
        const left = within(list).getAllByRole("listitem");
        expect(left).toHaveLength(1);
        expect(left[0]?.textContent).toContain("Things on Plan A: 11 → 22");
        // The keyboard is on the next change's Undo, not lost.
        expect(document.activeElement?.getAttribute("aria-label")).toBe(
            "Undo: Things on Plan A: 11 → 22",
        );
        // No toast: a draft edit's feedback is the list and the bar.
        expect(screen.queryByRole("status")?.textContent ?? "").toBe("");

        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        const sent = actions.savePricingDraftAction.mock.calls.at(-1)?.[0] as {
            catalog: Catalog;
        };
        expect(sent.catalog.plans[1]?.pricePaise).toBe(11_100);
        expect(sent.catalog.modules[0]?.cells.a).toMatchObject({ limit: 22 });
        expect(
            within(screen.getByRole("region", { name: "Draft" })).getByText(
                "1 change, not live yet.",
            ),
        ).toBeTruthy();
    });

    it("offers no Undo without pricing:edit", () => {
        render(
            <PlansShell
                data={{
                    ...withDraft(),
                    access: {
                        canEdit: false,
                        canPublish: false,
                        canManageCoupons: false,
                    },
                }}
                impact={null}
                tab="plans"
            />,
        );
        const list = screen.getByRole("region", {
            name: "Changes in this draft",
        });
        expect(within(list).getAllByRole("listitem")).toHaveLength(2);
        expect(
            within(list).queryByRole("button", { name: /^Undo/ }),
        ).toBeNull();
    });

    it("hides, and remembers that it was hidden", () => {
        const view = render(
            <PlansShell data={withDraft()} impact={null} tab="plans" />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
        expect(
            screen.queryByRole("complementary", { name: "Live preview" }),
        ).toBeNull();
        expect(window.localStorage.getItem(PREVIEW_HIDDEN_KEY)).toBe("1");
        view.unmount();

        render(<PlansShell data={withDraft()} impact={null} tab="plans" />);
        expect(
            screen.queryByRole("complementary", { name: "Live preview" }),
        ).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
        expect(
            screen.getByRole("complementary", { name: "Live preview" }),
        ).toBeTruthy();
        expect(window.localStorage.getItem(PREVIEW_HIDDEN_KEY)).toBeNull();
    });

    it("still hides when the browser refuses to store it", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        render(<PlansShell data={withDraft()} impact={null} tab="plans" />);
        expect(
            screen.getByRole("complementary", { name: "Live preview" }),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
        expect(
            screen.queryByRole("complementary", { name: "Live preview" }),
        ).toBeNull();
    });

    it("is only on the Plans tab", () => {
        render(<PlansShell data={withDraft()} impact={null} tab="offers" />);
        expect(
            screen.queryByRole("button", { name: "Hide preview" }),
        ).toBeNull();
        expect(
            screen.queryByRole("complementary", { name: "Live preview" }),
        ).toBeNull();
    });
});

describe("the full page preview", () => {
    it("saves the draft and opens the token link in a new tab", async () => {
        const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
        const open = vi
            .spyOn(window, "open")
            .mockReturnValue(tab as unknown as Window);
        actions.previewPricingAction.mockResolvedValue({
            ok: true,
            data: { token: "t/k+n", expiresAt: "", revision: 3 },
        });
        render(<PlansShell data={withDraft()} impact={null} tab="plans" />);
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: /^Full page preview/ }),
            );
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(open).toHaveBeenCalledWith("about:blank", "_blank");
        expect(actions.previewPricingAction).toHaveBeenCalledWith(3);
        expect(tab.opener).toBeNull();
        expect(tab.location.href).toBe(
            "https://site.example.test/pricing/preview?token=t%2Fk%2Bn",
        );
    });

    it("says in the bar, alone, why it didn't open", async () => {
        const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
        vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
        actions.previewPricingAction.mockResolvedValue({
            ok: false,
            error: "The preview link couldn't be made.",
        });
        render(<PlansShell data={withDraft()} impact={null} tab="plans" />);
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: /^Full page preview/ }),
            );
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(tab.close).toHaveBeenCalled();
        const bar = screen.getByRole("region", { name: "Draft" });
        expect(within(bar).getByRole("alert").textContent).toBe(
            "The preview link couldn't be made.",
        );
        // It replaces the bar's count rather than stacking under it.
        expect(within(bar).queryByText(/not live yet/)).toBeNull();
        fireEvent.click(within(bar).getByRole("button", { name: "Close" }));
        expect(within(bar).getByText("2 changes, not live yet.")).toBeTruthy();
    });

    it("isn't offered with no draft", () => {
        render(<PlansShell data={tabData()} impact={null} tab="plans" />);
        expect(
            screen.queryByRole("button", { name: /^Full page preview/ }),
        ).toBeNull();
    });
});

describe("one notice at a time", () => {
    it("lets an overtaken draft's notice take the bar's words", () => {
        const v2 = tabCatalog();
        v2.plans[2].pricePaise = 44_400;
        render(
            <PlansShell
                data={tabData({
                    pricing: tabPricing({
                        liveVersion: 2,
                        versions: [
                            fakeVersion({ version: 2, catalog: v2 }),
                            fakeVersion({
                                status: "earlier",
                                catalog: tabCatalog(),
                            }),
                        ],
                        draft: fakeDraft({
                            catalog: changedCatalog(),
                            baseVersion: 1,
                        }),
                    }),
                })}
                impact={null}
                tab="plans"
            />,
        );
        const bar = screen.getByRole("region", { name: "Draft" });
        expect(screen.getAllByRole("alert")).toHaveLength(1);
        expect(within(bar).getByRole("alert").textContent).toMatch(
            /^Version 2 was published after this draft was started/,
        );
        expect(within(bar).queryByText(/not live yet/)).toBeNull();
    });
});
