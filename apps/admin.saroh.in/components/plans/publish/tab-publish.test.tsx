/** @vitest-environment jsdom */
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlansData } from "@/components/plans/plans-context";
import type { AdminPricingImpact } from "@/lib/pricing-types";
import {
    ASHA,
    fakeDraft,
    fakePricing,
    fakeVersion,
} from "@/test/pricing-fixture";

import type { Catalog } from "@saroh/pricing-catalog";
import { formatInr } from "@saroh/pricing-catalog";

import { PlansShell } from "../plans-shell";
import { dateProblem, publishLabel, tomorrowStart } from "./publish";
import { reachCounts } from "./reach";

const actions = vi.hoisted(() => ({
    savePricingDraftAction: vi.fn(),
    discardPricingDraftAction: vi.fn(),
    previewPricingAction: vi.fn(),
    pricingImpactAction: vi.fn(),
    publishPricingAction: vi.fn(),
}));
vi.mock("@/lib/pricing-actions", () => actions);
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

const IMPACT: AdminPricingImpact = {
    revision: 3,
    liveVersion: 1,
    impact: {
        items: [
            {
                tone: "warn",
                label: "Check",
                title: "Plan B costs more",
                detail: "They pay more if they move.",
                businesses: [{ id: "o1", name: "Shop One" }],
            },
        ],
        touched: 1,
        total: 3,
        revenue: { nowPaise: 10_000, nextPaise: 15_000 },
    },
};

function data(over: Partial<PlansData> = {}): PlansData {
    return {
        pricing: fakePricing({ draft: fakeDraft() }),
        coupons: [],
        siteUrl: "https://site.example.test",
        me: ASHA,
        access: { canEdit: true, canPublish: true, canManageCoupons: true },
        ...over,
    };
}

function draw(over: Partial<PlansData> = {}, impact = IMPACT) {
    return render(
        <PlansShell data={data(over)} impact={impact} tab="publish" />,
    );
}

function publishButton() {
    // The panel's last button: the one whose label says what's missing.
    const panel = screen.getByRole("region", { name: "Publish" });
    const button = within(panel).getAllByRole("button").at(-1);
    if (!button) throw new Error("No publish button");
    return button;
}

beforeEach(() => {
    actions.pricingImpactAction.mockResolvedValue({ ok: true, data: IMPACT });
    window.history.replaceState(null, "", "/plans?tab=publish");
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("Review and publish", () => {
    it("shows what the draft does, from the API's figures", () => {
        draw();
        const impact = screen.getByRole("region", {
            name: "Who it reaches",
        });
        expect(within(impact).getByText("Plan B costs more")).toBeTruthy();
        expect(within(impact).getByText("Shop One")).toBeTruthy();
        expect(within(impact).getByText("of 3 on a plan")).toBeTruthy();
        expect(
            screen.getByRole("region", { name: "Live and draft side by side" }),
        ).toBeTruthy();
    });

    it("says what's missing on the button until a policy is chosen", () => {
        draw();
        const button = publishButton();
        expect(button.textContent).toBe(
            "Choose what happens to existing businesses",
        );
        expect(button).toHaveProperty("disabled", true);
        fireEvent.click(
            screen.getByRole("radio", {
                name: /They keep their current terms/,
            }),
        );
        expect(publishButton().textContent).toBe("Publish version 2 now");
        fireEvent.click(screen.getByRole("radio", { name: "On a date" }));
        expect(publishButton().textContent).toBe(
            "Pick a date from tomorrow on",
        );
    });

    it("publishes the saved revision, then opens Versions with a toast", async () => {
        actions.publishPricingAction.mockResolvedValue({
            ok: true,
            data: {
                version: 2,
                goLiveAt: "2026-10-03T00:00:00.000Z",
                status: "live",
                policy: "keep",
                changes: [],
                moves: { moved: 0, notices: 0 },
                providerPlans: 0,
            },
        });
        draw();
        fireEvent.click(
            screen.getByRole("radio", {
                name: /They keep their current terms/,
            }),
        );
        fireEvent.change(screen.getByLabelText("Note for the change log"), {
            target: { value: "Plan B moves up" },
        });
        fireEvent.click(publishButton());
        const dialog = screen.getByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "Agreed in review" },
        });
        await act(async () => {
            fireEvent.click(
                within(dialog).getByRole("button", {
                    name: "Publish version 2",
                }),
            );
            await Promise.resolve();
        });

        expect(actions.publishPricingAction).toHaveBeenCalledWith(
            expect.objectContaining({
                revision: 3,
                policy: "keep",
                note: "Plan B moves up",
                reason: "Agreed in review",
            }),
        );
        expect(
            actions.publishPricingAction.mock.calls[0]?.[0],
        ).not.toHaveProperty("goLiveAt", expect.anything());
        await waitFor(() =>
            expect(
                screen.getByText("Version 2 is live on the pricing page"),
            ).toBeTruthy(),
        );
        expect(
            screen
                .getByRole("tab", { name: /^Versions/ })
                .getAttribute("aria-selected"),
        ).toBe("true");
    });

    it("keeps the dialog open with the draft's errors when the API refuses", async () => {
        actions.publishPricingAction.mockResolvedValue({
            ok: false,
            error: "Fix the draft before publishing it.",
            status: 400,
            details: { errors: ["Only one plan can be highlighted"] },
        });
        draw();
        fireEvent.click(
            screen.getByRole("radio", {
                name: /They keep their current terms/,
            }),
        );
        fireEvent.click(publishButton());
        const dialog = screen.getByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "Agreed in review" },
        });
        await act(async () => {
            fireEvent.click(
                within(dialog).getByRole("button", {
                    name: "Publish version 2",
                }),
            );
            await Promise.resolve();
        });
        expect(within(dialog).getByRole("alert").textContent).toBe(
            "Fix the draft before publishing it. Only one plan can be highlighted",
        );
    });

    it("hides publishing without pricing:publish", () => {
        draw({
            access: {
                canEdit: true,
                canPublish: false,
                canManageCoupons: false,
            },
        });
        expect(screen.queryByRole("region", { name: "Publish" })).toBeNull();
        expect(screen.getByText(/Publishing needs permission/)).toBeTruthy();
    });

    it("won't publish while another version is scheduled", () => {
        draw({
            pricing: fakePricing({
                draft: fakeDraft(),
                versions: [
                    fakeVersion({
                        version: 2,
                        status: "scheduled",
                        goLiveAt: "2026-10-20T00:00:00.000Z",
                    }),
                    fakeVersion(),
                ],
            }),
        });
        fireEvent.click(
            screen.getByRole("radio", {
                name: /They keep their current terms/,
            }),
        );
        expect(publishButton().textContent).toBe(
            "Version 2 is already scheduled",
        );
    });

    it("with no draft, says there's nothing yet and offers no publish", () => {
        draw({ pricing: fakePricing() }, null as never);
        expect(screen.getByText(/^No draft\./)).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Go to Plans" }),
        ).toBeTruthy();
        // No empty Live / Draft table with nothing in it.
        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.queryByRole("region", { name: "Publish" })).toBeNull();
    });
});

describe("each change, and who it reaches (U13)", () => {
    const PRICE = `Plan B: ${formatInr(11_100)} → ${formatInr(22_200)} a month`;

    it("lists each change with its plan, who it reaches, Edit and Undo", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: true,
            data: { revision: 4, valid: true, errors: [], changes: [] },
        });
        draw({
            pricing: fakePricing({
                draft: fakeDraft(),
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
        });
        expect(
            screen.getByText("1 change becomes version 2 when you publish."),
        );
        const list = screen.getByRole("region", {
            name: "Changes in this draft",
        });
        const row = within(list).getByRole("listitem");
        expect(within(row).getByText("Plan B")).toBeTruthy();
        expect(within(row).getByText(PRICE)).toBeTruthy();
        expect(within(row).getByText("2 businesses at renewal")).toBeTruthy();

        // Undo takes back that change, and only it.
        fireEvent.click(
            within(row).getByRole("button", { name: `Undo: ${PRICE}` }),
        );
        expect(within(list).queryByRole("listitem")).toBeNull();
        expect(within(list).getByText("No changes yet.")).toBeTruthy();
        await waitFor(() =>
            expect(actions.savePricingDraftAction).toHaveBeenCalled(),
        );
        const sent = actions.savePricingDraftAction.mock.calls.at(-1)?.[0] as {
            catalog: { plans: { id: string; pricePaise: number }[] };
        };
        expect(sent.catalog.plans.find((p) => p.id === "b")?.pricePaise).toBe(
            11_100,
        );
    });

    it("opens where a change is made from its Edit", () => {
        draw();
        fireEvent.click(screen.getByRole("button", { name: `Edit: ${PRICE}` }));
        expect(window.location.search).toBe("?tab=plans");
        // The Plans tab, opened on Plan B's sheet, where its price is.
        expect(
            within(screen.getByRole("dialog")).getAllByText(/Plan B/).length,
        ).toBeGreaterThan(0);
    });

    it("counts who comes out better off, worse off and on a new price", () => {
        const counts = reachCounts(
            {
                items: [
                    {
                        tone: "ok",
                        label: "Gives more",
                        title: "Things added to Plan C",
                        detail: "",
                        businesses: [
                            { id: "o1", name: "Shop One" },
                            { id: "o2", name: "Shop Two" },
                        ],
                    },
                    {
                        tone: "danger",
                        label: "Takes away",
                        title: "Things taken off Plan A",
                        detail: "",
                        businesses: [{ id: "o3", name: "Shop Three" }],
                    },
                    {
                        tone: "warn",
                        label: "Check",
                        title: PRICE,
                        detail: "",
                        businesses: [
                            { id: "o1", name: "Shop One" },
                            { id: "o4", name: "Shop Four" },
                        ],
                    },
                ],
                touched: 4,
                total: 5,
                revenue: { nowPaise: 0, nextPaise: 0 },
            },
            new Set([PRICE]),
        );
        expect(counts).toEqual({ better: 2, worse: 1, price: 2 });

        draw();
        const reach = screen.getByRole("region", { name: "Who it reaches" });
        expect(within(reach).getByText("Better off")).toBeTruthy();
        expect(within(reach).getByText("Worse off")).toBeTruthy();
        expect(
            within(reach).getByText(
                "Nobody loses a module or goes over a limit",
            ),
        ).toBeTruthy();
    });

    it("saves an edit made here before publishing, and asks for a reason", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: true,
            data: { revision: 4, valid: true, errors: [], changes: [] },
        });
        actions.publishPricingAction.mockResolvedValue({
            ok: true,
            data: {
                version: 2,
                goLiveAt: "2026-10-03T00:00:00.000Z",
                status: "live",
                policy: "keep",
                changes: [],
                moves: { moved: 0, notices: 0 },
                providerPlans: 0,
            },
        });
        const draftCatalog = fakeDraft().catalog as Catalog;
        draftCatalog.plans[2].pricePaise = 33_300;
        draw({
            pricing: fakePricing({
                draft: fakeDraft({ catalog: draftCatalog }),
            }),
        });
        // Taken back here, and not saved yet when Publish is pressed.
        fireEvent.click(screen.getByRole("button", { name: `Undo: ${PRICE}` }));
        fireEvent.click(
            screen.getByRole("radio", {
                name: /They keep their current terms/,
            }),
        );
        fireEvent.click(publishButton());
        const dialog = screen.getByRole("dialog");
        const confirm = within(dialog).getByRole("button", {
            name: "Publish version 2",
        });
        expect(within(dialog).getByLabelText(/Reason/)).toBeTruthy();
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "Agreed in review" },
        });
        await act(async () => {
            fireEvent.click(confirm);
            await Promise.resolve();
        });
        await waitFor(() =>
            expect(actions.publishPricingAction).toHaveBeenCalled(),
        );
        // Saved first, and the revision that save returned is published.
        const saveOrder =
            actions.savePricingDraftAction.mock.invocationCallOrder[0] ?? 0;
        const publishOrder =
            actions.publishPricingAction.mock.invocationCallOrder[0] ?? 0;
        expect(saveOrder).toBeLessThan(publishOrder);
        expect(actions.publishPricingAction).toHaveBeenCalledWith(
            expect.objectContaining({
                revision: 4,
                reason: "Agreed in review",
            }),
        );
    });

    it("can't publish a draft a newer version has overtaken", () => {
        draw({
            pricing: fakePricing({
                draft: fakeDraft({ baseVersion: 1 }),
                liveVersion: 2,
                versions: [
                    fakeVersion({ version: 2 }),
                    fakeVersion({ status: "earlier" }),
                ],
            }),
        });
        fireEvent.click(
            screen.getByRole("radio", {
                name: /They keep their current terms/,
            }),
        );
        expect(publishButton().textContent).toBe(
            "Version 2 was published since this draft was started",
        );
        expect(publishButton()).toHaveProperty("disabled", true);
    });
});

describe("publish rules", () => {
    const now = new Date(2026, 9, 3, 15, 0);
    it("takes a go-live from tomorrow and within a year", () => {
        expect(dateProblem("now", null, now)).toBeNull();
        expect(dateProblem("date", null, now)).toBe(
            "Pick a date from tomorrow on",
        );
        expect(dateProblem("date", new Date(2026, 9, 3), now)).toBe(
            "Pick a date from tomorrow on",
        );
        expect(dateProblem("date", tomorrowStart(now), now)).toBeNull();
        expect(dateProblem("date", new Date(2027, 9, 10), now)).toBe(
            "Pick a date within a year",
        );
    });

    it("labels the button by what is missing, policy first", () => {
        const base = { nextV: 4, when: "date" as const, blocked: null };
        expect(
            publishLabel({ ...base, policy: null, dateProblem: "x" }).label,
        ).toBe("Choose what happens to existing businesses");
        expect(
            publishLabel({ ...base, policy: "move", dateProblem: null }),
        ).toEqual({ label: "Schedule version 4", ready: true });
    });
});

describe("publishing the first version", () => {
    it("isn't blocked for having nothing to differ from", () => {
        draw(
            {
                pricing: fakePricing({
                    liveVersion: null,
                    versions: [],
                    draft: fakeDraft({ baseVersion: null }),
                }),
            },
            null as never,
        );
        expect(
            screen.getByRole("heading", { name: "Publish version 1" }),
        ).toBeTruthy();
        expect(publishButton().textContent).not.toBe(
            "Nothing differs from the live version",
        );
    });
});
