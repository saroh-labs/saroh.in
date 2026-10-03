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

import { PlansShell } from "../plans-shell";
import { dateProblem, publishLabel, tomorrowStart } from "./publish";

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

describe("Review & publish", () => {
    it("shows what the draft does, from the API's figures", () => {
        draw();
        const impact = screen.getByRole("region", {
            name: "What this draft does",
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
        expect(screen.getByText(/No changes yet/)).toBeTruthy();
        expect(screen.queryByRole("region", { name: "Publish" })).toBeNull();
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
