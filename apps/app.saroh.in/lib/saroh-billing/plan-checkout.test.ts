import { describe, expect, it, vi } from "vitest";

import type {
    ApiAnswer,
    ChangeAnswer,
    PlanCheckoutCalls,
    QuoteAnswer,
} from "./plan-checkout";
import {
    CHECKOUT_FAILED,
    checkoutInput,
    checkoutIntent,
    planIntentNote,
    startPlanCheckout,
} from "./plan-checkout";

/** The plan picked on saroh.in, after onboarding (plan U27). */
const GROW = { plan: "grow", cycle: "month" as const };

function calls(
    quote: ApiAnswer<QuoteAnswer>,
    change?: ApiAnswer<ChangeAnswer>,
): PlanCheckoutCalls & {
    quote: ReturnType<typeof vi.fn>;
    change: ReturnType<typeof vi.fn>;
} {
    return {
        quote: vi.fn(() => Promise.resolve(quote)),
        change: vi.fn(() =>
            Promise.resolve(
                change ?? {
                    ok: false as const,
                    status: 500,
                    error: "unexpected",
                },
            ),
        ),
    };
}

describe("startPlanCheckout", () => {
    it("quotes, then starts the change, then goes to the provider's page", async () => {
        const c = calls(
            { ok: true, data: { kind: "NEW" } },
            {
                ok: true,
                data: {
                    kind: "NEW",
                    authorisationUrl: "https://pay.fake.test/fake_sub_1",
                },
            },
        );
        await expect(startPlanCheckout(GROW, c)).resolves.toEqual({
            kind: "authorise",
            url: "https://pay.fake.test/fake_sub_1",
        });
        expect(c.quote).toHaveBeenCalledWith(GROW);
        // Only the plan and the cycle: never an amount (KTD-18).
        expect(c.change).toHaveBeenCalledWith(GROW);
    });

    it("stops at the quote when there is nothing to buy", async () => {
        for (const kind of ["NONE", "TO_FREE"] as const) {
            const c = calls({ ok: true, data: { kind } });
            await expect(startPlanCheckout(GROW, c)).resolves.toEqual({
                kind: "done",
            });
            expect(c.change).not.toHaveBeenCalled();
        }
    });

    it("an unknown plan is Free, and says so", async () => {
        const c = calls({ ok: false, status: 404, error: "no plan" });
        const r = await startPlanCheckout(GROW, c);
        expect(r).toEqual({
            kind: "failed",
            error: "That plan isn't one Saroh offers, so it's on Free.",
        });
        expect(c.change).not.toHaveBeenCalled();
    });

    it("a refused quote or change is Free, in its own words, not the API's", async () => {
        const refusedQuote = calls({
            ok: false,
            status: 503,
            error: "provider plan not synced",
        });
        await expect(startPlanCheckout(GROW, refusedQuote)).resolves.toEqual({
            kind: "failed",
            error: CHECKOUT_FAILED,
        });
        const refusedChange = calls(
            { ok: true, data: { kind: "UPGRADE" } },
            { ok: false, status: 502, error: "Razorpay said no" },
        );
        await expect(startPlanCheckout(GROW, refusedChange)).resolves.toEqual({
            kind: "failed",
            error: CHECKOUT_FAILED,
        });
    });

    it("never follows a page that isn't https, or no page at all", async () => {
        for (const authorisationUrl of [
            "http://pay.example.test/x",
            "javascript:alert(1)",
            "not a url",
            null,
        ]) {
            const c = calls(
                { ok: true, data: { kind: "NEW" } },
                { ok: true, data: { kind: "NEW", authorisationUrl } },
            );
            await expect(startPlanCheckout(GROW, c)).resolves.toEqual({
                kind: "failed",
                error: CHECKOUT_FAILED,
            });
        }
    });
});

describe("checkoutInput", () => {
    it("takes a plan id and a cycle, and nothing else", () => {
        expect(checkoutInput({ plan: "grow", cycle: "year" })).toEqual({
            plan: "grow",
            cycle: "year",
        });
        expect(
            checkoutInput({ plan: "grow", cycle: "month", pricePaise: 1 }),
        ).toEqual({ plan: "grow", cycle: "month" });
    });

    it("refuses anything that isn't one", () => {
        for (const input of [
            null,
            "grow",
            { plan: "Grow", cycle: "month" },
            { plan: "grow", cycle: "week" },
            { plan: "../x", cycle: "month" },
            { cycle: "month" },
        ]) {
            expect(checkoutInput(input)).toBeNull();
        }
    });
});

describe("planIntentNote and checkoutIntent", () => {
    const paid = {
        kind: "paid" as const,
        plan: "grow",
        name: "Plan B",
        cycle: "year" as const,
        yearlyDropped: false,
    };

    it("a paid plan: named with its cycle, and the way to stay on Free", () => {
        expect(planIntentNote(paid)).toBe(
            "You picked Plan B, billed yearly. Once this is set up, you'll go to the payment page to start it, or you can leave it there and stay on Free.",
        );
        expect(
            planIntentNote({ ...paid, cycle: "month", yearlyDropped: true }),
        ).toMatch(/billed monthly.*Yearly billing isn't offered right now/);
        expect(checkoutIntent(paid)).toEqual({
            plan: "grow",
            cycle: "year",
            name: "Plan B",
        });
    });

    it("an unknown plan: Free, said plainly, never echoing the link", () => {
        expect(planIntentNote({ kind: "unknown" })).toBe(
            "The plan in your link isn't one Saroh offers, so this starts on Free.",
        );
        expect(checkoutIntent({ kind: "unknown" })).toBeNull();
    });

    it("no plan: nothing said, nothing to check out", () => {
        expect(planIntentNote({ kind: "none" })).toBeNull();
        expect(checkoutIntent({ kind: "none" })).toBeNull();
    });

    it("unchecked: nothing said, the checkout decides", () => {
        const intent = {
            kind: "unchecked" as const,
            plan: "grow",
            cycle: "month" as const,
        };
        expect(planIntentNote(intent)).toBeNull();
        expect(checkoutIntent(intent)).toMatchObject({ plan: "grow" });
    });
});
