import { formatInr } from "@saroh/pricing-catalog";

import type { ChangeQuote, Cycle } from "./plan-view";

/**
 * A plan change's quote in words (DEC-093, UX-011): what is paid today and
 * why, what is charged later and for how long, and what happens if it
 * doesn't go through — said exactly as the payment window will say it.
 * Every amount is the API's (KTD-18); nothing here adds GST or a total.
 *
 * - Monthly is autopay for 12 charges, then a one-tap renewal.
 * - Yearly is one payment for 12 months, no autopay.
 * - Setting up autopay always takes a payment. When it's a real charge (a
 *   first month, a first charge, an upgrade's difference) it says so and
 *   that it isn't refunded; when nothing is owed, it says Razorpay takes a
 *   small amount to check the mandate and refunds it.
 */

/** A line of a quote: what, and how much or when. */
export interface QuoteLine {
    label: string;
    value: string;
    iso?: string | null;
}

export interface QuoteSummary {
    title: string;
    lead: string;
    lines: QuoteLine[];
    /** The confirm button; null when there is nothing to do. */
    confirm: string | null;
    /** Whether it goes on to the payment window. */
    toPayment: boolean;
}

const per = (cycle: Cycle) => (cycle === "year" ? "a year" : "a month");

/** "₹1.18 (incl. GST)". */
const withGst = (paise: number) => `${formatInr(paise)} (incl. GST)`;

const REFUNDED =
    "Nothing is owed today. To set up UPI Autopay or a card, Razorpay takes a small amount and refunds it.";

/** A change's quote in words, from the plan the business is on now. */
export function quoteSummary(
    q: ChangeQuote,
    opts: { currentPlan?: string | null } = {},
): QuoteSummary {
    const plan = q.plan.name;
    const current = opts.currentPlan ?? "your current plan";
    const stay = `If it doesn't go through, you stay on ${current}.`;
    const oneTime = q.payment === "ONE_TIME";
    const recurring: QuoteLine = {
        label: `${plan}, ${q.cycle === "year" ? "yearly" : "monthly"}`,
        value: `${formatInr(q.pricePaise)} + ${formatInr(q.gstPaise)} GST = ${formatInr(q.totalPaise)} ${per(q.cycle)}`,
    };
    const term: QuoteLine = oneTime
        ? {
              label: "Then",
              value: "Before the year ends, we ask you to pay for the next one",
          }
        : {
              label: "Term",
              value: `${q.termCharges || 12} monthly charges, then we ask you to pay for the next 12`,
          };
    const coupon: QuoteLine[] = q.coupon
        ? [
              {
                  label: `Coupon ${q.coupon.code}`,
                  value: `${formatInr(q.coupon.discountPaise)} off ${
                      q.cycle === "year"
                          ? "the first yearly charge"
                          : q.coupon.charges === 1
                            ? "the first month"
                            : `each of the first ${q.coupon.charges} months`
                  }`,
              },
              {
                  label: "First charge",
                  value: `${formatInr(q.firstChargePaise)} + ${formatInr(q.firstChargeGstPaise)} GST = ${formatInr(q.firstChargeTotalPaise)}`,
              },
          ]
        : [];
    const today = (label: string): QuoteLine => ({
        label,
        value: withGst(q.payNowTotalPaise),
    });
    const toPayment = { confirm: "Continue to payment", toPayment: true };

    switch (q.kind) {
        case "NONE":
            return {
                title: `You're on ${plan} already`,
                lead: "Nothing changes.",
                lines: [],
                confirm: null,
                toPayment: false,
            };
        case "TO_FREE":
            return {
                title: `Move to ${plan}`,
                lead: "Everything stays until then. Anything over Free's limits stays readable; you can't add more.",
                lines: [
                    {
                        label: "From",
                        value: q.effectiveAt ? "" : "Today",
                        iso: q.effectiveAt,
                    },
                ],
                confirm: `Move to ${plan}`,
                toPayment: false,
            };
        case "TRIAL":
            // DEC-093's nominal first month, or free first days.
            if (q.chargeNowPaise > 0) {
                return {
                    title: `Start ${plan} with your first month`,
                    lead: `Your first month is ${withGst(q.chargeNowTotalPaise)}, paid today as you set up UPI Autopay or a card. It pays for the month and isn't refunded. Cancel before the month ends and you pay nothing more. ${stay}`,
                    lines: [
                        today("Today, your first month"),
                        { label: "Then from", value: "", iso: q.trialEndsAt },
                        recurring,
                        term,
                        ...coupon,
                    ],
                    ...toPayment,
                };
            }
            return {
                title: `Start your ${plan} trial`,
                lead: `${REFUNDED} Cancel before the trial ends and you pay nothing. ${stay}`,
                lines: [
                    { label: "Trial ends", value: "", iso: q.trialEndsAt },
                    recurring,
                    term,
                    ...coupon,
                ],
                ...toPayment,
            };
        case "UPGRADE":
            return oneTime
                ? {
                      title: `Upgrade to ${plan}`,
                      lead: `One payment for the rest of your year; you're on ${plan} as soon as it goes through. ${stay}`,
                      lines: [
                          {
                              label: "Today, for the rest of your year",
                              value: `${formatInr(q.chargeNowPaise)} + ${formatInr(q.chargeNowGstPaise)} GST = ${formatInr(q.chargeNowTotalPaise)}`,
                          },
                          {
                              label: "Your year ends",
                              value: "",
                              iso: q.startAt,
                          },
                          term,
                      ],
                      ...toPayment,
                  }
                : {
                      title: `Upgrade to ${plan}`,
                      lead: `You pay the difference for the rest of this period today, as you set up autopay for ${plan}; it isn't refunded. You're on ${plan} as soon as it goes through. ${stay}`,
                      lines: [
                          {
                              label: "Today, for the rest of this period",
                              value: `${formatInr(q.chargeNowPaise)} + ${formatInr(q.chargeNowGstPaise)} GST = ${formatInr(q.chargeNowTotalPaise)}`,
                          },
                          recurring,
                          { label: "Then from", value: "", iso: q.startAt },
                          term,
                      ],
                      ...toPayment,
                  };
        case "SCHEDULED":
            return oneTime
                ? {
                      title: `Move to ${plan}`,
                      lead: "You pay for the year today. It starts on the date below, and everything stays as it is until then.",
                      lines: [
                          today("Today, for 12 months"),
                          { label: "Starts", value: "", iso: q.startAt },
                          term,
                      ],
                      ...toPayment,
                  }
                : {
                      title: `Move to ${plan}`,
                      lead: `${REFUNDED} Nothing changes until it starts.`,
                      lines: [
                          { label: "Starts", value: "", iso: q.startAt },
                          recurring,
                          term,
                      ],
                      ...toPayment,
                  };
        case "RENEW":
            return oneTime
                ? {
                      title: `Renew ${plan} for another year`,
                      lead: "One payment for your next 12 months, at today's price. They start the day this year ends.",
                      lines: [
                          today("Today, for 12 months"),
                          { label: "From", value: "", iso: q.startAt },
                      ],
                      ...toPayment,
                  }
                : {
                      title: `Renew ${plan}`,
                      lead: `Your next 12 months start the day this term ends, at today's price. ${REFUNDED}`,
                      lines: [
                          { label: "From", value: "", iso: q.startAt },
                          recurring,
                          term,
                      ],
                      ...toPayment,
                  };
        default:
            return oneTime
                ? {
                      title: `Start ${plan}`,
                      lead: `One payment for 12 months, no autopay. You're on ${plan} as soon as it goes through. ${stay}`,
                      lines: [
                          today("Today, for 12 months"),
                          recurring,
                          ...coupon,
                          term,
                      ],
                      ...toPayment,
                  }
                : {
                      title: `Start ${plan}`,
                      lead: `You pay your first month today as you set up UPI Autopay or a card. It's your first month, so it isn't refunded. You're on ${plan} as soon as it goes through. ${stay}`,
                      lines: [
                          recurring,
                          today("Today, your first month"),
                          ...coupon,
                          term,
                      ],
                      ...toPayment,
                  };
    }
}
