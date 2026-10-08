/** @vitest-environment jsdom */
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlansData } from "@/components/plans/plans-context";
import type { AdminPricing } from "@/lib/pricing-types";
import { ASHA, fakeDraft, fakePricing, RAVI } from "@/test/pricing-fixture";

import { AUTOSAVE_MS, useDraft } from "./draft-store";
import { PlansShell } from "./plans-shell";

const actions = vi.hoisted(() => ({
    savePricingDraftAction: vi.fn(),
    discardPricingDraftAction: vi.fn(),
    previewPricingAction: vi.fn(),
    pricingImpactAction: vi.fn(),
}));
vi.mock("@/lib/pricing-actions", () => actions);

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

// The Plans tab is U7's; here it is one button that edits the draft the way
// a field would, so the shell's own behaviour can be driven.
vi.mock("@/components/plans/plans/tab-plans", () => ({
    TabPlans: function FakePlansTab() {
        const { edit, catalog, canEdit } = useDraft();
        return (
            <div>
                <p>Price of Plan B: {catalog?.plans[1]?.pricePaise}</p>
                <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                        edit((c) => {
                            c.plans = c.plans.map((p) =>
                                p.id === "b"
                                    ? {
                                          ...p,
                                          pricePaise: p.pricePaise + 11_100,
                                      }
                                    : p,
                            );
                        })
                    }
                >
                    Change Plan B
                </button>
            </div>
        );
    },
}));

function data(
    over: Partial<PlansData> = {},
    pricing?: AdminPricing,
): PlansData {
    return {
        pricing: pricing ?? fakePricing(),
        coupons: [],
        siteUrl: "https://site.example.test",
        me: ASHA,
        access: { canEdit: true, canPublish: true, canManageCoupons: true },
        ...over,
    };
}

beforeEach(() => {
    vi.useFakeTimers();
    actions.pricingImpactAction.mockResolvedValue({ ok: true, data: null });
    window.history.replaceState(null, "", "/plans");
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe("the status bar", () => {
    it("shows Live with no draft, and the Draft banner after an edit", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: true,
            data: { revision: 1, valid: true, errors: [], changes: [] },
        });
        render(<PlansShell data={data()} impact={null} tab="plans" />);

        expect(screen.getByText("Live")).toBeTruthy();
        expect(screen.getByText("Version 1")).toBeTruthy();
        expect(screen.queryByText(/^Draft ·/)).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        expect(screen.getByText("Draft · 1 change")).toBeTruthy();
        expect(screen.queryByText("Live")).toBeNull();
        expect(
            screen.getByRole("tab", { name: "Review & publish · 1" }),
        ).toBeTruthy();

        // Autosaved, debounced, as a new draft (revision 0).
        expect(actions.savePricingDraftAction).not.toHaveBeenCalled();
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(1);
        expect(actions.savePricingDraftAction.mock.calls[0]?.[0]).toMatchObject(
            {
                revision: 0,
            },
        );
        expect(screen.getByText("Saved")).toBeTruthy();
    });

    it("saves the next edit on the revision the last save returned", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: true,
            data: { revision: 4, valid: true, errors: [], changes: [] },
        });
        render(
            <PlansShell
                data={data({}, fakePricing({ draft: fakeDraft() }))}
                impact={null}
                tab="plans"
            />,
        );
        expect(screen.getByText(/^Draft ·/)).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(actions.savePricingDraftAction.mock.calls[0]?.[0]).toMatchObject(
            {
                revision: 3,
            },
        );
    });

    it("says who saved since when a save is refused, with Reload draft", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: false,
            status: 409,
            error: "Ravi saved the draft since.",
            details: { revision: 5, updatedBy: RAVI, updatedAt: null },
        });
        render(
            <PlansShell
                data={data({}, fakePricing({ draft: fakeDraft() }))}
                impact={null}
                tab="plans"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));

        expect(
            screen.getByText(
                "Ravi saved the draft since. Reload the draft to see their changes.",
            ),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Reload draft" }));
        expect(refresh).toHaveBeenCalled();

        // Nothing more is saved over Ravi's work.
        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2));
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(1);
    });

    it("says a failed save wasn't saved, and tries again", async () => {
        actions.savePricingDraftAction
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                error: "The draft could not be saved.",
            })
            .mockResolvedValueOnce({
                ok: true,
                data: { revision: 1, valid: true, errors: [], changes: [] },
            });
        render(<PlansShell data={data()} impact={null} tab="plans" />);
        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(screen.getByText(/The draft could not be saved\./)).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Try again" }));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(2);
        expect(screen.getByText("Saved")).toBeTruthy();
    });

    it("names the draft's other editors before discarding it (D-2)", async () => {
        actions.discardPricingDraftAction.mockResolvedValue({
            ok: true,
            data: { discarded: true },
        });
        render(
            <PlansShell
                data={data({}, fakePricing({ draft: fakeDraft() }))}
                impact={null}
                tab="plans"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
        expect(screen.getByText(/Ravi has edited this draft too/)).toBeTruthy();

        await act(async () => {
            fireEvent.click(
                within(screen.getByRole("dialog")).getByRole("button", {
                    name: "Discard draft",
                }),
            );
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(actions.discardPricingDraftAction).toHaveBeenCalledWith(
            expect.objectContaining({ revision: 3 }),
        );
        expect(screen.getByText("Draft discarded")).toBeTruthy();
        expect(screen.getByText("Live")).toBeTruthy();
    });
});

describe("without pricing:edit", () => {
    it("edits nothing and offers no Review & publish or Discard", () => {
        render(
            <PlansShell
                data={data(
                    {
                        access: {
                            canEdit: false,
                            canPublish: false,
                            canManageCoupons: false,
                        },
                    },
                    fakePricing({ draft: fakeDraft() }),
                )}
                impact={null}
                tab="plans"
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Review & publish" }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Discard draft" }),
        ).toBeNull();
        expect(
            screen
                .getByRole("button", { name: "Change Plan B" })
                .hasAttribute("disabled"),
        ).toBe(true);
    });

    it("says the live bar is read only", () => {
        render(
            <PlansShell
                data={data({
                    access: {
                        canEdit: false,
                        canPublish: false,
                        canManageCoupons: false,
                    },
                })}
                impact={null}
                tab="plans"
            />,
        );
        expect(
            screen.getByText("You can see pricing here but not change it."),
        ).toBeTruthy();
    });
});

describe("the tabs", () => {
    it("opens the tab the link names", () => {
        render(<PlansShell data={data()} impact={null} tab="versions" />);
        expect(
            screen
                .getByRole("tab", { name: "Versions · 1" })
                .getAttribute("aria-selected"),
        ).toBe("true");
    });

    it("puts the open tab in the address", () => {
        render(
            <PlansShell
                data={data({}, fakePricing({ draft: fakeDraft() }))}
                impact={null}
                tab="plans"
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Review & publish" }),
        );
        expect(window.location.search).toBe("?tab=publish");
        expect(
            screen
                .getByRole("tab", { name: /^Review & publish/ })
                .getAttribute("aria-selected"),
        ).toBe("true");
    });
});

describe("an instance with no pricing yet", () => {
    const empty = () =>
        fakePricing({ liveVersion: null, versions: [], draft: null });

    it("offers the starter catalogue and a blank start, instead of empty tabs", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: true,
            data: { revision: 1, valid: true, errors: [], changes: [] },
        });
        render(
            <PlansShell data={data({}, empty())} impact={null} tab="plans" />,
        );

        expect(screen.getByText("No pricing yet")).toBeTruthy();
        expect(screen.queryByRole("tablist")).toBeNull();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Start from the starter catalogue",
            }),
        );
        // The draft is open, and saved as a new one.
        expect(screen.getByRole("tablist")).toBeTruthy();
        expect(screen.queryByText("No pricing yet")).toBeNull();
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        const sent = actions.savePricingDraftAction.mock.calls[0]?.[0] as {
            revision: number;
            catalog: { plans: { pricePaise: number }[] };
        };
        expect(sent.revision).toBe(0);
        expect(sent.catalog.plans.length).toBeGreaterThan(1);
        expect(sent.catalog.plans.every((p) => p.pricePaise === 0)).toBe(true);
    });

    it("starts blank with one plan", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: true,
            data: { revision: 1, valid: true, errors: [], changes: [] },
        });
        render(
            <PlansShell data={data({}, empty())} impact={null} tab="plans" />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        const sent = actions.savePricingDraftAction.mock.calls[0]?.[0] as {
            catalog: { plans: unknown[]; groups: unknown[] };
        };
        expect(sent.catalog.plans).toHaveLength(1);
        expect(sent.catalog.groups).toHaveLength(1);
    });

    it("says who can start it, without pricing:edit", () => {
        render(
            <PlansShell
                data={data(
                    {
                        access: {
                            canEdit: false,
                            canPublish: false,
                            canManageCoupons: false,
                        },
                    },
                    empty(),
                )}
                impact={null}
                tab="plans"
            />,
        );
        expect(screen.getByText("No pricing yet")).toBeTruthy();
        expect(
            screen.getByText(
                "Someone with permission to edit pricing can start it.",
            ),
        ).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Start blank" }),
        ).toBeNull();
    });
});
