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
import {
    ASHA,
    fakeCatalog,
    fakeDraft,
    fakePricing,
    fakeVersion,
    RAVI,
} from "@/test/pricing-fixture";

import { AUTOSAVE_MS, useDraft } from "./draft-store";
import { PlansShell } from "./plans-shell";
import { RETURN_REFRESH_MS, WAITING_REFRESH_MS } from "./use-page-return";

const actions = vi.hoisted(() => ({
    savePricingDraftAction: vi.fn(),
    discardPricingDraftAction: vi.fn(),
    previewPricingAction: vi.fn(),
    pricingImpactAction: vi.fn(),
}));
vi.mock("@/lib/pricing-actions", () => actions);

const refresh = vi.fn();
// One router for every render, as Next's is.
const router = { refresh, replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const reloadPage = vi.hoisted(() => vi.fn());
vi.mock("./reload-page", () => ({ reloadPage }));

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

/** The draft bar at the foot of the screen; null with no draft. */
function bar() {
    return screen.queryByRole("region", { name: "Draft" });
}

/** The draft bar, which must be there. */
function theBar() {
    return screen.getByRole("region", { name: "Draft" });
}

describe("the header and the draft bar", () => {
    it("says what is live with no draft, and shows the bar after an edit", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: true,
            data: { revision: 1, valid: true, errors: [], changes: [] },
        });
        render(<PlansShell data={data()} impact={null} tab="plans" />);

        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Plans and modules",
            }),
        ).toBeTruthy();
        expect(screen.getByText(/^Live: version 1, published/)).toBeTruthy();
        expect(bar()).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        expect(
            within(theBar()).getByText("1 change, not live yet."),
        ).toBeTruthy();
        expect(
            screen.getByRole("tab", { name: "Review and publish 1" }),
        ).toBeTruthy();
        expect(
            screen.getByRole("tab", { name: "Plans 1 changed" }),
        ).toBeTruthy();

        // Autosaved, debounced, as a new draft (revision 0).
        expect(actions.savePricingDraftAction).not.toHaveBeenCalled();
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(1);
        expect(actions.savePricingDraftAction.mock.calls[0]?.[0]).toMatchObject(
            {
                revision: 0,
                // The version it copied, so the API can refuse a stale one.
                baseVersion: 1,
            },
        );
        expect(
            within(theBar()).getByRole("button", { name: "Saved" }),
        ).toBeTruthy();
    });

    it("says who would move at renewal, by plan", () => {
        render(
            <PlansShell
                data={data(
                    {},
                    fakePricing({
                        plans: [
                            {
                                planId: "b",
                                name: "Plan B",
                                retired: false,
                                businesses: 2,
                                olderVersion: 0,
                            },
                        ],
                    }),
                )}
                impact={null}
                tab="plans"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        expect(
            within(theBar()).getByText(
                "2 businesses on Plan B would move at their renewal.",
            ),
        ).toBeTruthy();
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
        expect(bar()).toBeTruthy();

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

        // One notice: the 409 takes the bar's words, not a second box.
        const alert = within(theBar()).getByRole("alert");
        expect(alert.textContent).toBe(
            "Ravi saved the draft since. Reload the draft to see their changes.",
        );
        expect(within(theBar()).queryByText(/not live yet/)).toBeNull();
        expect(screen.getAllByRole("alert")).toHaveLength(1);
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
        expect(
            within(theBar()).getByRole("button", { name: "Saved" }),
        ).toBeTruthy();
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
        fireEvent.click(screen.getByRole("button", { name: "Discard…" }));
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
        expect(bar()).toBeNull();
    });
});

describe("without pricing:edit", () => {
    it("edits nothing and offers no Review and publish or Discard", () => {
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
            screen.queryByRole("button", { name: "Review and publish" }),
        ).toBeNull();
        expect(screen.queryByRole("button", { name: "Discard…" })).toBeNull();
        expect(
            screen
                .getByRole("button", { name: "Change Plan B" })
                .hasAttribute("disabled"),
        ).toBe(true);
    });

    it("says in the header that it is read only", () => {
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
            screen.getByText(/You can see pricing here but not change it$/),
        ).toBeTruthy();
    });
});

describe("the tabs", () => {
    it("opens the tab the link names", () => {
        render(<PlansShell data={data()} impact={null} tab="versions" />);
        expect(
            screen
                .getByRole("tab", { name: "Versions 1" })
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
            screen.getByRole("button", { name: "Review and publish" }),
        );
        expect(window.location.search).toBe("?tab=publish");
        expect(
            screen
                .getByRole("tab", { name: /^Review and publish/ })
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
            baseVersion: number | null;
            catalog: { plans: { pricePaise: number }[] };
        };
        expect(sent.revision).toBe(0);
        expect(sent.baseVersion).toBeNull();
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

/** Version 2 is published over version 1, with Plan B's price changed. */
function withVersion2(status: "live" | "waiting" = "live"): AdminPricing {
    const catalog = fakeCatalog();
    catalog.plans = catalog.plans.map((p) =>
        p.id === "b" ? { ...p, pricePaise: 33_300 } : p,
    );
    return fakePricing({
        now: "2026-10-04T00:00:00.000Z",
        liveVersion: status === "live" ? 2 : 1,
        versions: [
            fakeVersion({ version: 2, status, catalog }),
            fakeVersion({
                version: 1,
                status: status === "live" ? "earlier" : "live",
            }),
        ],
    });
}

const saved = (revision: number, baseVersion: number | null = 1) => ({
    ok: true,
    data: {
        revision,
        baseVersion,
        createdAt: "2026-10-03T10:00:00.000Z",
        updatedAt: "2026-10-03T10:00:00.000Z",
        valid: true,
        errors: [],
        changes: [],
    },
});

describe("a version published while the page sat open", () => {
    it("edits from a version waiting for billing, not the live one under it", async () => {
        actions.savePricingDraftAction.mockResolvedValue(saved(1, 2));
        render(
            <PlansShell
                data={data({}, withVersion2("waiting"))}
                impact={null}
                tab="plans"
            />,
        );
        // Version 1 is live, and the editor shows and copies version 2.
        expect(
            screen.getByText(
                /^Live: version 1.* · Version 2 is waiting for billing · You edit from version 2$/,
            ),
        ).toBeTruthy();
        expect(screen.getByText("Price of Plan B: 33300")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        const sent = actions.savePricingDraftAction.mock.calls[0]?.[0] as {
            baseVersion: number;
            catalog: { plans: { id: string; pricePaise: number }[] };
        };
        expect(sent.baseVersion).toBe(2);
        expect(sent.catalog.plans[1]?.pricePaise).toBe(33_300 + 11_100);
    });

    it("keeps a refused start on screen, says which version is newer and what was changed", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: false,
            status: 409,
            error: "Version 2 has been published since this page was opened.",
            details: {
                revision: null,
                updatedBy: null,
                updatedAt: null,
                newestVersion: 2,
                baseVersion: 1,
            },
        });
        // This page was read while version 1 was the newest.
        const view = render(
            <PlansShell data={data()} impact={null} tab="plans" />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));

        expect(actions.savePricingDraftAction.mock.calls[0]?.[0]).toMatchObject(
            { revision: 0, baseVersion: 1 },
        );
        expect(
            screen.getByText(
                "Version 2 was published since you opened this page, so your changes weren't saved. Reload to start from version 2.",
            ),
        ).toBeTruthy();
        // The edit is still on screen, and the page is read again.
        expect(screen.getByText("Price of Plan B: 22200")).toBeTruthy();
        expect(refresh).toHaveBeenCalledTimes(1);

        // That read arrives: the edit stays, with what it had changed.
        view.rerender(
            <PlansShell
                data={data({}, withVersion2())}
                impact={null}
                tab="plans"
            />,
        );
        expect(screen.getByText("Price of Plan B: 22200")).toBeTruthy();
        const notice = screen.getByRole("alert");
        expect(notice.textContent).toContain(
            "Version 2 was published after you started these changes from version 1, so they weren't saved.",
        );
        expect(
            within(
                screen.getByRole("list", { name: "Your changes" }),
            ).getAllByRole("listitem"),
        ).toHaveLength(1);

        // Nothing more is saved over version 2.
        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2));
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(1);

        // Start again: the next edit copies version 2.
        fireEvent.click(
            screen.getByRole("button", { name: "Start again from version 2" }),
        );
        expect(refresh).toHaveBeenCalledTimes(2);
        view.rerender(
            <PlansShell
                data={data(
                    {},
                    {
                        ...withVersion2(),
                        now: "2026-10-04T00:01:00.000Z",
                    },
                )}
                impact={null}
                tab="plans"
            />,
        );
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByText("Price of Plan B: 33300")).toBeTruthy();
        actions.savePricingDraftAction.mockResolvedValue(saved(1, 2));
        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(
            actions.savePricingDraftAction.mock.calls.at(-1)?.[0],
        ).toMatchObject({ revision: 0, baseVersion: 2 });
    });

    it("says a saved draft was overtaken, and why it can't be published", () => {
        render(
            <PlansShell
                data={data(
                    {},
                    { ...withVersion2(), draft: fakeDraft({ baseVersion: 1 }) },
                )}
                impact={null}
                tab="plans"
            />,
        );
        expect(screen.getByRole("alert").textContent).toContain(
            "Version 2 was published after this draft was started from version 1. Publishing the draft would undo that, so it can't be published.",
        );
        // A saved draft is thrown away with Discard, not from the notice.
        expect(
            screen.queryByRole("button", { name: /^Start again/ }),
        ).toBeNull();
        expect(screen.getByRole("button", { name: "Discard…" })).toBeTruthy();
        // It can't be sent to Review and publish from the bar either.
        expect(
            within(theBar()).queryByRole("button", {
                name: "Review and publish",
            }),
        ).toBeNull();
    });
});

describe("coming back to the page", () => {
    const back = (event: Event, target: EventTarget = window) =>
        act(() => {
            target.dispatchEvent(event);
        });

    it("reads the page again on focus, and takes a newer version when nothing is unsaved", () => {
        const view = render(
            <PlansShell data={data()} impact={null} tab="plans" />,
        );
        vi.advanceTimersByTime(RETURN_REFRESH_MS);
        back(new Event("focus"));
        expect(refresh).toHaveBeenCalledTimes(1);
        // Focus and visibility arrive together: one read answers both.
        back(new Event("visibilitychange"), document);
        expect(refresh).toHaveBeenCalledTimes(1);

        view.rerender(
            <PlansShell
                data={data({}, withVersion2())}
                impact={null}
                tab="plans"
            />,
        );
        expect(screen.getByText(/^Live: version 2,/)).toBeTruthy();
        expect(screen.getByText("Price of Plan B: 33300")).toBeTruthy();
    });

    it("warns instead of taking the read when an edit isn't saved", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: false,
            status: 500,
            error: "The draft could not be saved.",
        });
        const view = render(
            <PlansShell data={data()} impact={null} tab="plans" />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        vi.advanceTimersByTime(RETURN_REFRESH_MS);
        back(new Event("focus"));
        expect(refresh).toHaveBeenCalledTimes(1);

        view.rerender(
            <PlansShell
                data={data({}, withVersion2())}
                impact={null}
                tab="plans"
            />,
        );
        // The unsaved edit is still what is on screen.
        expect(screen.getByText("Price of Plan B: 22200")).toBeTruthy();
        expect(
            screen.getByText(
                /^Version 2 was published after you started these changes from version 1/,
            ),
        ).toBeTruthy();
    });

    it("doesn't read while a save is about to go", () => {
        actions.savePricingDraftAction.mockResolvedValue(saved(1));
        render(<PlansShell data={data()} impact={null} tab="plans" />);
        vi.advanceTimersByTime(RETURN_REFRESH_MS);
        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        back(new Event("focus"));
        expect(refresh).not.toHaveBeenCalled();
    });

    it("loads the page again when the browser's Back restores it", () => {
        render(<PlansShell data={data()} impact={null} tab="plans" />);
        const shown = new Event("pageshow");
        Object.defineProperty(shown, "persisted", { value: true });
        back(shown);
        expect(reloadPage).toHaveBeenCalledTimes(1);
    });

    it("keeps looking while a version waits for billing", () => {
        render(
            <PlansShell
                data={data({}, withVersion2("waiting"))}
                impact={null}
                tab="plans"
            />,
        );
        act(() => {
            vi.advanceTimersByTime(WAITING_REFRESH_MS);
        });
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("doesn't take a read that left before the last save landed", async () => {
        actions.savePricingDraftAction.mockResolvedValue(saved(1));
        const view = render(
            <PlansShell data={data()} impact={null} tab="plans" />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Change Plan B" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(bar()).toBeTruthy();

        // Read at 00:00 on the 3rd, before the save at 10:00: no draft yet.
        view.rerender(
            <PlansShell
                data={data({}, { ...fakePricing() })}
                impact={null}
                tab="plans"
            />,
        );
        expect(bar()).toBeTruthy();
        expect(screen.getByText("Price of Plan B: 22200")).toBeTruthy();
    });
});

describe("Save draft", () => {
    const button = (name: string) => screen.getByRole("button", { name });

    it("isn't there with no draft and nothing edited", () => {
        render(<PlansShell data={data()} impact={null} tab="plans" />);
        expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
    });

    it("saves now, says Saving… on the way, then Saved and when", async () => {
        let land: (value: unknown) => void = () => undefined;
        actions.savePricingDraftAction.mockReturnValue(
            new Promise((resolve) => {
                land = resolve;
            }),
        );
        render(<PlansShell data={data()} impact={null} tab="plans" />);
        fireEvent.click(button("Change Plan B"));
        expect(screen.getByText("Not saved yet")).toBeTruthy();

        // Pressed before the autosave's pause is over.
        await act(async () => {
            fireEvent.click(button("Save draft"));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(1);
        expect(button("Saving…").hasAttribute("disabled")).toBe(true);

        await act(async () => {
            land(saved(1));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(button("Saved").hasAttribute("disabled")).toBe(true);
        expect(screen.getByText(/^Saved 3 Oct, /)).toBeTruthy();
        // The pause's own save has nothing left to send.
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2));
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(1);
    });

    it("leaves a failed save to Not saved and Try again, and can be pressed again", async () => {
        actions.savePricingDraftAction
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                error: "The draft could not be saved.",
            })
            .mockResolvedValueOnce(saved(1));
        render(<PlansShell data={data()} impact={null} tab="plans" />);
        fireEvent.click(button("Change Plan B"));
        await act(async () => {
            fireEvent.click(button("Save draft"));
            await vi.advanceTimersByTimeAsync(0);
        });
        // One error, in the place it always was.
        expect(screen.getAllByRole("alert")).toHaveLength(1);
        expect(screen.getByText(/The draft could not be saved\./)).toBeTruthy();
        expect(button("Try again")).toBeTruthy();

        await act(async () => {
            fireEvent.click(button("Save draft"));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(2);
        expect(button("Saved")).toBeTruthy();
    });

    it("can't be pressed over someone else's save", async () => {
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
        fireEvent.click(button("Change Plan B"));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(button("Reload draft")).toBeTruthy();
        expect(
            screen
                .getAllByRole("button")
                .filter((b) =>
                    /^(Save draft|Saved|Saving…)$/.test(b.textContent),
                )
                .every((b) => b.hasAttribute("disabled")),
        ).toBe(true);
    });

    it("isn't offered without pricing:edit", () => {
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
        expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    });

    it("is what the editor opens on next time: the server's draft, as saved", async () => {
        actions.savePricingDraftAction.mockResolvedValue(saved(1));
        const first = render(
            <PlansShell data={data()} impact={null} tab="plans" />,
        );
        fireEvent.click(button("Change Plan B"));
        await act(async () => {
            fireEvent.click(button("Save draft"));
            await vi.advanceTimersByTimeAsync(0);
        });
        const sent = actions.savePricingDraftAction.mock.calls[0]?.[0] as {
            catalog: unknown;
        };
        first.unmount();

        // The page is opened again (a reload, another tab, a return): it
        // reads the draft the API was sent.
        render(
            <PlansShell
                data={data(
                    {},
                    fakePricing({
                        now: "2026-10-03T11:00:00.000Z",
                        draft: fakeDraft({
                            catalog: sent.catalog,
                            revision: 1,
                            baseVersion: 1,
                            updatedAt: "2026-10-03T10:00:00.000Z",
                            updatedBy: ASHA,
                            editors: [ASHA],
                        }),
                    }),
                )}
                impact={null}
                tab="plans"
            />,
        );
        expect(screen.getByText("Price of Plan B: 22200")).toBeTruthy();
        expect(bar()).toBeTruthy();
        expect(button("Saved").hasAttribute("disabled")).toBe(true);
        expect(screen.getByText(/^Saved 3 Oct, /)).toBeTruthy();
    });
});
