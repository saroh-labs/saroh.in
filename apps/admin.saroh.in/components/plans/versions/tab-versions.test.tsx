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
import type { AdminPricing } from "@/lib/pricing-types";
import {
    ASHA,
    fakeDraft,
    fakePricing,
    fakeVersion,
    RAVI,
} from "@/test/pricing-fixture";

import { PlansShell } from "../plans-shell";

const actions = vi.hoisted(() => ({
    savePricingDraftAction: vi.fn(),
    discardPricingDraftAction: vi.fn(),
    previewPricingAction: vi.fn(),
    pricingImpactAction: vi.fn(),
    cancelPricingVersionAction: vi.fn(),
    rollbackPricingVersionAction: vi.fn(),
}));
vi.mock("@/lib/pricing-actions", () => actions);
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

function history(over: Partial<AdminPricing> = {}): AdminPricing {
    return fakePricing({
        liveVersion: 2,
        versions: [
            fakeVersion({
                version: 3,
                status: "scheduled",
                goLiveAt: "2026-10-20T00:00:00.000Z",
                policy: "move",
                businesses: 0,
                moving: 2,
                changes: ["Plan B: a → b a month"],
                publishedBy: RAVI,
            }),
            fakeVersion({
                version: 2,
                status: "live",
                businesses: 3,
                note: "Raised a limit",
                sync: { pending: 1, synced: 2, failed: 1 },
            }),
            fakeVersion({ version: 1, status: "earlier", businesses: 0 }),
        ],
        ...over,
    });
}

function data(over: Partial<PlansData> = {}): PlansData {
    return {
        pricing: history(),
        coupons: [],
        siteUrl: "https://site.example.test",
        me: ASHA,
        access: { canEdit: true, canPublish: true, canManageCoupons: true },
        ...over,
    };
}

function draw(over: Partial<PlansData> = {}) {
    return render(
        <PlansShell data={data(over)} impact={null} tab="versions" />,
    );
}

function card(v: number) {
    return screen.getByRole("article", { name: `Version ${v}` });
}

beforeEach(() => {
    actions.pricingImpactAction.mockResolvedValue({ ok: true, data: null });
    window.history.replaceState(null, "", "/plans?tab=versions");
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("the Versions tab", () => {
    it("lists versions newest first with status, who, policy and who is on them", () => {
        draw();
        const cards = screen.getAllByRole("article");
        expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
            "Version 3",
            "Version 2",
            "Version 1",
        ]);
        expect(within(card(3)).getByText("Scheduled")).toBeTruthy();
        expect(within(card(3)).getByText(/^Goes live .* · Ravi$/)).toBeTruthy();
        expect(within(card(3)).getByText("2 moving to it")).toBeTruthy();
        expect(within(card(2)).getByText("Live")).toBeTruthy();
        expect(within(card(2)).getByText("Raised a limit")).toBeTruthy();
        expect(within(card(2)).getByText(/3 on it/)).toBeTruthy();
        expect(
            within(card(2)).getByText("Billing: 2 of 4 plans ready · 1 failed"),
        ).toBeTruthy();
        expect(within(card(1)).getByText("First version")).toBeTruthy();
        expect(within(card(1)).getByText("Nobody on it")).toBeTruthy();
    });

    it("says a version waiting for the billing provider is waiting for billing", () => {
        draw({
            pricing: history({
                versions: [fakeVersion({ version: 1, status: "waiting" })],
            }),
        });
        expect(within(card(1)).getByText("Waiting for billing")).toBeTruthy();
    });

    it("cancels a scheduled version through a dialog", async () => {
        actions.cancelPricingVersionAction.mockResolvedValue({
            ok: true,
            data: { cancelled: 3, movesCleared: 2 },
        });
        draw();
        fireEvent.click(
            within(card(3)).getByRole("button", { name: "Cancel schedule" }),
        );
        const dialog = screen.getByRole("dialog");
        expect(
            within(dialog).getByText(/2 businesses due to move/),
        ).toBeTruthy();
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "Not yet" },
        });
        await act(async () => {
            fireEvent.click(
                within(dialog).getByRole("button", { name: "Cancel schedule" }),
            );
            await Promise.resolve();
        });
        expect(actions.cancelPricingVersionAction).toHaveBeenCalledWith(
            3,
            expect.objectContaining({ reason: "Not yet" }),
        );
        await waitFor(() =>
            expect(screen.getByText("Version 3 won't go live")).toBeTruthy(),
        );
    });

    it("rolls back to an earlier version as the next one", async () => {
        actions.rollbackPricingVersionAction.mockResolvedValue({
            ok: true,
            data: {
                version: 3,
                goLiveAt: "2026-10-03T00:00:00.000Z",
                status: "live",
                policy: "keep",
                changes: [],
                moves: { moved: 0, notices: 0 },
                providerPlans: 0,
            },
        });
        draw({
            pricing: history({
                versions: history().versions.filter((v) => v.version !== 3),
            }),
        });
        fireEvent.click(
            within(card(1)).getByRole("button", { name: "Roll back to this" }),
        );
        const dialog = screen.getByRole("dialog");
        expect(
            within(dialog).getByText(
                /publishes version 1's pricing again as version 3/,
            ),
        ).toBeTruthy();
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "Back it out" },
        });
        await act(async () => {
            fireEvent.click(
                within(dialog).getByRole("button", {
                    name: "Publish as version 3",
                }),
            );
            await Promise.resolve();
        });
        expect(actions.rollbackPricingVersionAction).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ reason: "Back it out" }),
        );
        await waitFor(() =>
            expect(
                screen.getByText(
                    "Version 1's pricing is live again as version 3",
                ),
            ).toBeTruthy(),
        );
    });

    it("won't roll back while a draft exists", () => {
        draw({
            pricing: history({
                draft: fakeDraft(),
                versions: history().versions.filter((v) => v.version !== 3),
            }),
        });
        expect(
            within(card(1)).getByRole("button", { name: "Roll back to this" }),
        ).toHaveProperty("disabled", true);
        expect(
            within(card(1)).getByText("Publish or discard your draft first"),
        ).toBeTruthy();
    });

    it("offers no cancel or roll back without pricing:publish", () => {
        draw({
            access: {
                canEdit: true,
                canPublish: false,
                canManageCoupons: false,
            },
        });
        expect(
            screen.queryByRole("button", { name: "Cancel schedule" }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Roll back to this" }),
        ).toBeNull();
    });
});
