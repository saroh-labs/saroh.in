import { formatInr } from "@saroh/pricing-catalog";

import { listWords } from "@/lib/modules/switch-plan";

import type { ChangeQuote, Cycle } from "./plan-view";

/**
 * A plan change's quote in words (DEC-093, UX-011): what is paid today and
 * why, what is charged later and for how long, and what happens if it
 * doesn't go through — said exactly as the payment window will say it.
 * Every amount is the API's (KTD-18); nothing here adds GST or a total.
 *
 * - Monthly is autopay. One approval covers so many monthly charges
 *   (`termCharges`, 12 today); before it runs out we ask the business to
 *   approve the next one (DEC-161). Never "term": it is not a price
 *   promise, and prices can change with notice and approval.
 * - Yearly is one payment for 12 months, no autopay.
 * - Setting up autopay always takes a payment. When it's a real charge (a
 *   first month, a first charge, an upgrade's difference) it says so and
 *   that it isn't refunded; when nothing is owed, it says Razorpay takes a
 *   small amount to check the mandate and refunds it.
 * - When it starts is said first (DEC-159): a dearer plan "Starts today"
 *   with what is paid now, and any other change "From ‹date›", with the
 *   plan kept until then. Nothing paid is refunded, so nothing is cut short.
 */

/** A line of a quote: what, and how much or when. */
export interface QuoteLine {
    label: string;
    value: string;
    iso?: string | null;
}

export interface QuoteSummary {
    title: string;
    /**
     * A change that waits for the end of what is paid: "From ‹date›: you
     * keep ‹plan› until then.", said before the lead. Null when it doesn't.
     */
    from: { iso: string; keep: string } | null;
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

/**
 * The add-ons that end with the change (DEC-157), said before the business
 * confirms: which, how many, and the new plan's own when it has one. It is
 * never bought for the business, so no price is said. Null when none ends
 * (or the API sent none).
 */
export function endingAddonsNote(
    q: ChangeQuote,
    opts: { currentPlan?: string | null } = {},
): string | null {
    const ending = q.addonsEnding ?? [];
    if (ending.length === 0) return null;
    const current = opts.currentPlan ?? "your current plan";
    const held = ending
        .map((a) => (a.quantity > 1 ? `${a.name} × ${a.quantity}` : a.name))
        .join(", ");
    const said =
        ending.length === 1
            ? `This add-on ends with ${current}: ${held}.`
            : `These add-ons end with ${current}: ${held}.`;
    const own = ending
        .flatMap((a) => (a.onNewPlan ? [a.onNewPlan] : []))
        .filter((name, i, all) => all.indexOf(name) === i);
    if (own.length === 0) return said;
    return `${said} After the change you can add ${listWords(own)} on ${q.plan.name}, from Add-ons on this page. Nothing is added for you.`;
}

/** What moving to Free does to what is over its limits: one sentence, two places. */
const OVER_FREE_LIMITS =
    "anything over Free's limits stays readable, but you can't add more.";

/** "Cancel plan"'s confirm, in words around its one date. */
export interface CancelWords {
    title: string;
    /** The sentence(s) before the date, or all of it when there is none. */
    lead: string;
    /** When the plan ends: the API's `effectiveAt`; null: today. */
    iso: string | null;
    tail: string;
    confirm: string;
    keep: string;
}

/**
 * "Cancel plan" (owner, 17 Oct 2026): what cancelling does, from Free's
 * own quote, so the date is the API's (`effectiveAt`, the end of what is
 * paid). Monthly autopay stops; a first month runs to its end with nothing
 * more charged (the ₹1 promise); a year paid once runs to the end of the
 * year with nothing asked for the next. Then the plan is Free, and what is
 * over its limits is said once, in the change dialog's own words. Nothing
 * takes it back yet, so it says so.
 */
export function cancelWords(
    q: Pick<ChangeQuote, "plan" | "effectiveAt" | "firstMonth">,
    opts: { planName: string; yearly: boolean; now?: Date },
): CancelWords {
    const free = q.plan.name;
    const now = opts.now ?? new Date();
    const ahead =
        q.effectiveAt !== null && new Date(q.effectiveAt) > now
            ? q.effectiveAt
            : null;
    const over = OVER_FREE_LIMITS;
    const base = {
        title: "Cancel your plan?",
        confirm: "Cancel plan",
        keep: `Keep ${opts.planName}`,
    };
    if (!ahead) {
        return {
            ...base,
            lead: `${opts.yearly ? "You" : "Autopay stops and you"} move to ${free} today. From then, ${over} This cannot be undone.`,
            iso: null,
            tail: "",
        };
    }
    const stops = opts.yearly
        ? "We won't ask you to pay for another year."
        : q.firstMonth === "AT_END"
          ? "Autopay stops, so nothing more is charged after your first month."
          : "Autopay stops, so nothing more is charged.";
    return {
        ...base,
        lead: `${stops} You keep ${opts.planName} until `,
        iso: ahead,
        tail: `${opts.yearly ? ", the end of the year you paid for," : ","} then move to ${free}. After that, ${over} This cannot be undone.`,
    };
}

/** A change's quote in words, from the plan the business is on now. */
export function quoteSummary(
    q: ChangeQuote,
    opts: { currentPlan?: string | null; now?: Date } = {},
): QuoteSummary {
    const plan = q.plan.name;
    const current = opts.currentPlan ?? "your current plan";
    const now = opts.now ?? new Date();
    /** The date a change waits for, while it is still ahead. */
    const waitsFor = (iso: string | null) =>
        iso && new Date(iso) > now ? { iso, keep: current } : null;
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
              label: "Autopay",
              value: `Covers ${q.termCharges || 12} monthly charges. Before it runs out, we ask you to approve the next one`,
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
    const toPayment = {
        from: null,
        confirm: "Continue to payment",
        toPayment: true,
    };
    const startsToday: QuoteLine = {
        label: "Starts today",
        value: `${formatInr(q.payNowTotalPaise)} now (incl. GST)`,
    };

    switch (q.kind) {
        case "NONE":
            return {
                title: `You're on ${plan} already`,
                from: null,
                lead: "Nothing changes.",
                lines: [],
                confirm: null,
                toPayment: false,
            };
        case "TO_FREE": {
            const from = waitsFor(q.effectiveAt);
            const over = OVER_FREE_LIMITS;
            return {
                title: `Move to ${plan}`,
                from,
                lead: !from
                    ? `From today, ${over}`
                    : q.firstMonth === "AT_END"
                      ? `Your first month runs to its end and nothing more is charged. After that, ${over}`
                      : `Nothing more is charged. After that, ${over}`,
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
        }
        case "TRIAL":
            // DEC-093's nominal first month, or free first days.
            if (q.chargeNowPaise > 0) {
                return {
                    title: `Start ${plan} with your first month`,
                    lead: `Your first month is ${withGst(q.chargeNowTotalPaise)}, paid today as you set up UPI Autopay or a card. It pays for the month and isn't refunded. Cancel plan under Your plan before the month ends and you pay nothing more. ${stay}`,
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
                lead: `${REFUNDED} Cancel plan under Your plan before the trial ends and you pay nothing. ${stay}`,
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
                      lead: `One payment for the rest of your year. You're on ${plan} as soon as it goes through. ${stay}`,
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
                      lead: `You pay the difference for the rest of this period today, as you set up autopay for ${plan}. It isn't refunded. You're on ${plan} as soon as it goes through. ${stay}`,
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
        case "SCHEDULED": {
            const firstMonth =
                q.firstMonth === "AT_END"
                    ? `Your first month runs to its end first, and nothing more is charged for ${current}. `
                    : "";
            return oneTime
                ? {
                      title: `Move to ${plan}`,
                      lead: `${firstMonth}You pay for the year today. It starts on the date below, and everything stays as it is until then.`,
                      lines: [
                          today("Today, for 12 months"),
                          { label: "Starts", value: "", iso: q.startAt },
                          term,
                      ],
                      ...toPayment,
                      from: waitsFor(q.startAt),
                  }
                : plan === opts.currentPlan
                  ? {
                        // The plan it's on at a new price (DEC-161).
                        title: `Approve ${plan}'s new price`,
                        lead: `${REFUNDED} You keep paying your current price until it starts.`,
                        lines: [
                            { label: "Starts", value: "", iso: q.startAt },
                            recurring,
                            term,
                        ],
                        ...toPayment,
                        from: null,
                    }
                  : {
                        title: `Move to ${plan}`,
                        lead: `${firstMonth}${REFUNDED} Nothing changes until it starts.`,
                        lines: [
                            { label: "Starts", value: "", iso: q.startAt },
                            recurring,
                            term,
                        ],
                        ...toPayment,
                        from: waitsFor(q.startAt),
                    };
        }
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
                      title: `Approve your next ${plan} autopay`,
                      lead: `Your next autopay starts the day this one runs out, at today's price. ${REFUNDED}`,
                      lines: [
                          { label: "From", value: "", iso: q.startAt },
                          recurring,
                          term,
                      ],
                      ...toPayment,
                  };
        default:
            // A dearer plan chosen during the first month (DEC-159): the
            // month ends, and the plan starts today at its full price.
            if (q.firstMonth === "NOW") {
                const ends = `${plan} starts today at its full price, so your first month on ${current} ends now. What you paid for it isn't refunded.`;
                return {
                    title: `Upgrade to ${plan}`,
                    lead: oneTime
                        ? `${ends} One payment for 12 months, no autopay. ${stay}`
                        : `${ends} You pay ${plan}'s first month today as you set up UPI Autopay or a card for it. ${stay}`,
                    lines: [startsToday, recurring, ...coupon, term],
                    ...toPayment,
                };
            }
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
