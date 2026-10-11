import { addMonthsUtc } from "@saroh/pricing-catalog";

import { parseBillingEmailPayload } from "./billing-email-payload";
import { renewalReminderEmail } from "./billing-emails";
import { ONE_TIME_PAYMENT } from "./billing-term";
import type { RenewalFacts } from "./renewal-reminder";
import {
    renewalDecision,
    renewalReminderEventKey,
    renewalTotalPaise,
} from "./renewal-reminder";

/**
 * The reminder 3 days before a plan renews (#804): when it is due, every
 * case that says nothing, what the charge comes to, and its words. Prices
 * are made up (Plan B at 222).
 */

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-10T06:00:00.000Z");
const renewsAt = new Date(now.getTime() + 2 * DAY);

/** Monthly autopay on Plan B, five months into its 12-month term. */
function facts(over: Partial<RenewalFacts> = {}): RenewalFacts {
    return {
        status: "ACTIVE",
        provider: "RAZORPAY",
        providerSubscriptionId: "sub_test",
        currentPeriodEnd: renewsAt,
        cancelAtPeriodEnd: false,
        pendingFrom: null,
        planPricePaise: 22200,
        checkout: {
            providerPlanId: "plan_test_b",
            cycle: "month",
            startAt: null,
            completedAt: addMonthsUtc(renewsAt, -5),
            createdAt: addMonthsUtc(renewsAt, -5),
        },
        scheduled: null,
        ...over,
    };
}

const reason = (f: RenewalFacts, at = now) => {
    const d = renewalDecision(f, at);
    return d.remind ? "remind" : d.reason;
};

describe("when a renewal reminder is due (#804)", () => {
    it("reminds an autopay charge within 3 days, at its period end", () => {
        expect(renewalDecision(facts(), now)).toEqual({
            remind: true,
            renewsAt,
        });
        // Exactly 3 days ahead counts; a moment more is not yet.
        const at3 = new Date(renewsAt.getTime() - 3 * DAY);
        expect(reason(facts(), at3)).toBe("remind");
        expect(reason(facts(), new Date(at3.getTime() - 1000))).toBe("not_due");
        // Past it: the charge is the provider's now, nothing to say.
        expect(reason(facts(), new Date(renewsAt.getTime() + 1))).toBe(
            "not_due",
        );
        expect(reason(facts({ currentPeriodEnd: null }))).toBe("not_due");
    });

    it("says nothing on Free, or a plan no provider bills", () => {
        expect(reason(facts({ planPricePaise: 0 }))).toBe("not_billed");
        expect(reason(facts({ provider: null }))).toBe("not_billed");
        expect(reason(facts({ providerSubscriptionId: null }))).toBe(
            "not_billed",
        );
    });

    it("says nothing in a trial or first month (its own email), past due or cancelled", () => {
        for (const status of ["TRIALING", "PAST_DUE", "CANCELLED"]) {
            expect(reason(facts({ status }))).toBe("not_active");
        }
    });

    it("says nothing when the plan ends then: a cancel, Free chosen, a term run out", () => {
        expect(reason(facts({ cancelAtPeriodEnd: true }))).toBe("ends_then");
    });

    it("says nothing when a move is due by the renewal, and reminds when it comes later", () => {
        expect(reason(facts({ pendingFrom: renewsAt }))).toBe("move_due");
        expect(
            reason(facts({ pendingFrom: new Date(now.getTime() + DAY) })),
        ).toBe("move_due");
        expect(
            reason(
                facts({ pendingFrom: new Date(renewsAt.getTime() + 20 * DAY) }),
            ),
        ).toBe("remind");
    });

    it("says nothing when another plan or the next term is authorised to start by then", () => {
        expect(reason(facts({ scheduled: { startAt: renewsAt } }))).toBe(
            "plan_authorised",
        );
        expect(reason(facts({ scheduled: { startAt: null } }))).toBe(
            "plan_authorised",
        );
        // The next term authorised from the term's end, a month on: this
        // charge still happens.
        expect(
            reason(
                facts({
                    scheduled: {
                        startAt: new Date(renewsAt.getTime() + 30 * DAY),
                    },
                }),
            ),
        ).toBe("remind");
    });

    it("says nothing for a year paid once (DEC-093): it never renews by itself", () => {
        expect(
            reason(
                facts({
                    checkout: {
                        providerPlanId: ONE_TIME_PAYMENT,
                        cycle: "year",
                        startAt: null,
                        completedAt: addMonthsUtc(renewsAt, -12),
                        createdAt: addMonthsUtc(renewsAt, -12),
                    },
                }),
            ),
        ).toBe("paid_once");
    });

    it("monthly: reminds the 12th charge, and says nothing at the term's end (DEC-100)", () => {
        const started = (monthsAgo: number) =>
            facts({
                checkout: {
                    providerPlanId: "plan_test_b",
                    cycle: "month",
                    startAt: null,
                    completedAt: addMonthsUtc(renewsAt, -monthsAgo),
                    createdAt: addMonthsUtc(renewsAt, -monthsAgo),
                },
            });
        // The period ending 11 months in starts the 12th charge.
        expect(reason(started(11))).toBe("remind");
        // The period ending 12 months in is the term's end: no charge.
        expect(reason(started(12))).toBe("term_ends");
    });

    it("an open-ended autopay (yearly before DEC-093, or no checkout) is reminded", () => {
        expect(
            reason(
                facts({
                    checkout: {
                        providerPlanId: "plan_test_b_year",
                        cycle: "year",
                        startAt: null,
                        completedAt: addMonthsUtc(renewsAt, -24),
                        createdAt: addMonthsUtc(renewsAt, -24),
                    },
                }),
            ),
        ).toBe("remind");
        expect(reason(facts({ checkout: null }))).toBe("remind");
    });

    it("keys one reminder per subscription and period end", () => {
        expect(renewalReminderEventKey("sub1", renewsAt)).toBe(
            "renewal-reminder:sub1:2026-11-12T06:00:00.000Z",
        );
    });
});

describe("what a renewal charges, GST included", () => {
    it("is the plan with GST, less a coupon still owed, plus add-ons", () => {
        expect(
            renewalTotalPaise({
                planPricePaise: 22200,
                discountPaise: 0,
                addons: [],
            }),
        ).toBe(26196);
        expect(
            renewalTotalPaise({
                planPricePaise: 22200,
                discountPaise: 2200,
                addons: [],
            }),
        ).toBe(23600);
        expect(
            renewalTotalPaise({
                planPricePaise: 22200,
                discountPaise: 0,
                addons: [{ quantity: 2, unitPaise: 5000 }],
            }),
        ).toBe(26196 + 11800);
    });
});

describe("the renewal reminder's words", () => {
    const input = {
        businessName: "Rye & Co.",
        planName: "Plan B",
        renewsOn: "12 Nov 2026",
        total: "₹261.96",
        cycle: "month" as const,
        withAddons: false,
        url: "https://app.example.test/settings/billing",
    };

    it("names the date, the amount with GST and the way to change it", () => {
        const email = renewalReminderEmail(input);
        expect(email.subject).toBe(
            "Rye & Co.'s Plan B plan renews on 12 Nov 2026",
        );
        expect(email.html).toContain(
            "On 12 Nov 2026, your autopay pays ₹261.96, GST included, for another month of Rye &amp; Co.&#39;s Plan B plan.",
        );
        expect(email.html).toContain("open Plan and billing before then");
        expect(email.html).toContain(`href="${input.url}"`);
        expect(email.html).toContain("Open Plan and billing");
        expect(email.html).not.toMatch(/trial|first month/i);
    });

    it("a year, with add-ons", () => {
        const email = renewalReminderEmail({
            ...input,
            cycle: "year",
            withAddons: true,
        });
        expect(email.html).toContain(
            "for another year of Rye &amp; Co.&#39;s Plan B plan and its add-ons.",
        );
    });

    it("its payload is checked", () => {
        const p = {
            kind: "RENEWAL",
            organizationId: "org1",
            subscriptionId: "sub1",
            renewsAt: renewsAt.toISOString(),
        };
        expect(parseBillingEmailPayload(p)).toEqual(p);
        expect(
            parseBillingEmailPayload({ ...p, renewsAt: undefined }),
        ).toBeNull();
    });
});
