import type { Catalog } from "@saroh/pricing-catalog";
import {
    catalogPlanIdForKey,
    formatInr,
    offeredPlans,
    planPricePaise,
} from "@saroh/pricing-catalog";

import type { BillingAccessView } from "@/lib/billing/access";

import type { NextCharge, SarohSubscription } from "./plan";

/**
 * Settings › Plan and billing on the plans catalogue (U14), as data: "Your
 * plan", the plan picker, a change's quote, add-ons and Saroh's invoices,
 * in the "Saroh Settings" design's words. Pure; the reads are in
 * `./service.ts`.
 *
 * Every amount is the API's, in integer paise (KTD-18). This file formats
 * them, and reads a yearly row's price with the catalogue's own rule
 * (`planPricePaise`); it never adds GST, discounts or totals.
 */

export type Cycle = "month" | "year";

/** `GET …/billing/invoices`: one of Saroh's invoices to the business. */
export interface SarohInvoice {
    id: string;
    number: string;
    issuedAt: string;
    planName: string;
    cycle: string;
    currency: string;
    taxablePaise: number;
    taxPaise: number;
    totalPaise: number;
}

/** `GET …/billing/addons`: one add-on. */
export interface AddonView {
    id: string;
    kind: string;
    module: string | null;
    name: string;
    mode: string;
    qty: number;
    pricePaise: number;
    gstPaise: number;
    totalPaise: number;
    quantity: number;
    heldPaise: number;
    available: boolean;
    why: string | null;
}

export interface AddonsView {
    canBuy: boolean;
    why: string | null;
    max: number;
    addons: AddonView[];
    heldPaise: number;
}

export type ChangeKind =
    "NONE" | "TO_FREE" | "NEW" | "UPGRADE" | "SCHEDULED" | "TRIAL";

/** `GET …/billing/change-plan`: what a change would be, and cost. */
export interface ChangeQuote {
    plan: { id: string; name: string; version: number };
    cycle: Cycle;
    kind: ChangeKind;
    pricePaise: number;
    gstPaise: number;
    totalPaise: number;
    chargeNowPaise: number;
    chargeNowGstPaise: number;
    chargeNowTotalPaise: number;
    startAt: string | null;
    effectiveAt: string | null;
    trialEndsAt: string | null;
    coupon: { code: string; discountPaise: number; charges: number } | null;
    firstChargePaise: number;
    firstChargeGstPaise: number;
    firstChargeTotalPaise: number;
}

export interface CheckoutView {
    id: string;
    kind: string;
    status: string;
    plan: { id: string; name: string; version: number };
    cycle: string;
    pricePaise: number;
    startAt: string | null;
    expiresAt: string;
    createdAt: string;
}

export interface CheckoutsView {
    open: CheckoutView | null;
    scheduled: CheckoutView | null;
}

/** `POST …/billing/change-plan`. */
export type ChangeResult =
    | { kind: "TO_FREE"; effectiveAt: string }
    | {
          kind: "NEW" | "UPGRADE" | "SCHEDULED" | "TRIAL";
          authorisationUrl: string | null;
      };

const per = (cycle: Cycle) => (cycle === "year" ? "a year" : "a month");

/** The cycle a subscription is billed on. */
export function billedCycle(sub: SarohSubscription | null): Cycle {
    return sub?.billingCycle === "year" ? "year" : "month";
}

/** "₹1,000 a month", "₹10,000 a year", or "₹0". */
export function priceWords(pricePaise: number, cycle: Cycle): string {
    return pricePaise > 0 ? `${formatInr(pricePaise)} ${per(cycle)}` : "₹0";
}

/** Whether the picker offers yearly, and how many months it gives free. */
export function yearlyOffer(
    catalog: Catalog | null,
): { on: false } | { on: true; freeMonths: number } {
    if (!catalog?.yearly.on) return { on: false };
    return { on: true, freeMonths: Math.max(0, 12 - catalog.yearly.paid) };
}

/** The catalogue plan the business is billed for: its row, else Free. */
export function billedPlanId(
    catalog: Catalog | null,
    sub: SarohSubscription | null,
): string | null {
    const id =
        sub && sub.status !== "CANCELLED"
            ? catalogPlanIdForKey(sub.plan.key)
            : null;
    if (id) return id;
    return catalog?.plans.find((p) => p.pricePaise === 0)?.id ?? null;
}

/** A note on "Your plan": words around one date, and what can be done. */
export interface PlanNote {
    tone: "info" | "attention";
    lead: string;
    iso: string | null;
    tail: string;
    /** Opens the change dialog for a plan: to authorise or start again. */
    action: { label: string; planId: string; cycle: Cycle } | null;
}

export interface YourPlanView {
    name: string;
    /** "₹1,000 a month + GST", "₹0"; null on a plan given for a while. */
    price: string | null;
    /** On a plan given for a while (a launch offer): free until this. */
    freeUntil: string | null;
    includes: string;
    next: NextCharge;
    method: string | null;
    notes: PlanNote[];
}

const PROVIDER_NAMES: Record<string, string> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
};

function planName(catalog: Catalog | null, id: string): string {
    return (
        catalog?.plans.find((p) => p.id === id)?.name ??
        id.charAt(0).toUpperCase() + id.slice(1)
    );
}

/**
 * "Your plan" on the catalogue: the plan its access reads (a plan override
 * included), what it pays, the next charge, and anything under way — a move
 * on a date, a checkout waiting to be authorised, a plan given for a while.
 */
export function yourPlan(input: {
    access: BillingAccessView;
    subscription: SarohSubscription | null;
    catalog: Catalog | null;
    liveVersion: number | null;
    checkouts: CheckoutsView | null;
    addonsHeld: boolean;
}): YourPlanView {
    const { access, subscription: sub, catalog } = input;
    const planId = access.plan?.id ?? "";
    const name = access.plan?.name ?? "Free";
    const cycle = billedCycle(sub);
    const row = catalog?.plans.find((p) => p.id === planId);
    const override = access.planOverride;
    const billedId = billedPlanId(catalog, sub);
    // Given a plan it isn't billed for (a launch offer, grandfathering).
    const given = override !== null && override.planKey !== billedId;

    const yearlyPaise =
        cycle === "year" && sub?.plan.interval === "year"
            ? sub.plan.priceCents
            : null;
    const paise = yearlyPaise ?? access.pricePaise ?? 0;
    const priceText =
        paise > 0
            ? `${priceWords(paise, yearlyPaise !== null ? "year" : "month")} + GST`
            : "₹0";

    const version =
        access.version !== null &&
        input.liveVersion !== null &&
        access.version !== input.liveVersion
            ? ` · You're on the pricing from version ${access.version}.`
            : "";
    const includes = (row?.tagline ?? "") + version;

    const notes: PlanNote[] = [];
    let next: NextCharge = { kind: "text", text: "Nothing to pay" };

    if (given) {
        const then = planName(catalog, billedId ?? "free");
        notes.push(
            override.expiresAt
                ? {
                      tone: "info",
                      lead: `${name} is yours, free, until `,
                      iso: override.expiresAt,
                      tail: `. Then you're on ${then} unless you choose a plan below.`,
                      action: null,
                  }
                : {
                      tone: "info",
                      lead: `${name} is yours, free, until Saroh changes it.`,
                      iso: null,
                      tail: "",
                      action: null,
                  },
        );
    }

    if (sub?.status === "CANCELLED") {
        next = { kind: "text", text: "Nothing — the plan has ended" };
    } else if (sub?.status === "PAST_DUE") {
        next = { kind: "text", text: "Payment overdue" };
        notes.push({
            tone: "attention",
            lead: "The last payment didn't go through. Nothing has been switched off yet.",
            iso: null,
            tail: "",
            action: null,
        });
    } else if (sub?.cancelAtPeriodEnd && sub.currentPeriodEnd) {
        next = { kind: "ends", iso: sub.currentPeriodEnd };
    } else if (!given && paise > 0 && sub?.currentPeriodEnd) {
        next = {
            kind: "charge",
            iso: sub.currentPeriodEnd,
            amount: `${formatInr(paise)} + GST${input.addonsHeld ? " + add-ons" : ""}`,
        };
        if (sub.status === "TRIALING") {
            notes.push({
                tone: "info",
                lead: "On a free trial — nothing is charged until ",
                iso: sub.currentPeriodEnd,
                tail: ". If that charge doesn't go through, you're back on Free.",
                action: null,
            });
        }
    }

    const move = access.pendingMove;
    if (move) {
        const to = planName(catalog, move.planId);
        if (move.waiting === "authorise") {
            notes.push({
                tone: "attention",
                lead: `Your plan was due to move to ${to} on `,
                iso: move.from,
                tail: `. Authorise the new amount to move; until then you stay on ${name}.`,
                action: { label: "Authorise", planId: move.planId, cycle },
            });
        } else if (move.waiting === "held") {
            notes.push({
                tone: "info",
                lead: `Your plan moves to ${to} from `,
                iso: move.from,
                tail: ". It's waiting on Saroh and applies on its own; everything stays until then.",
                action: null,
            });
        } else {
            notes.push({
                tone: "info",
                lead: `Your plan changes to ${to} on `,
                iso: move.from,
                tail: ". Everything stays until then.",
                action: null,
            });
        }
    } else if (input.checkouts?.scheduled) {
        const s = input.checkouts.scheduled;
        notes.push({
            tone: "info",
            lead: `${s.plan.name} starts on `,
            iso: s.startAt,
            tail: ", as you authorised. Everything stays until then.",
            action: null,
        });
    }

    const open = input.checkouts?.open;
    if (open) {
        notes.push({
            tone: "attention",
            lead: `Your move to ${open.plan.name} is waiting for you to authorise the payment. The payment page's link works once; start again for a new one. It lapses on `,
            iso: open.expiresAt,
            tail: ".",
            action: {
                label: "Start again",
                planId: open.plan.id,
                cycle: open.cycle === "year" ? "year" : "month",
            },
        });
    }

    return {
        name,
        price: given ? null : priceText,
        freeUntil: given ? (override.expiresAt ?? null) : null,
        includes,
        next,
        method: sub?.provider
            ? `Through ${PROVIDER_NAMES[sub.provider] ?? sub.provider}`
            : null,
        notes,
    };
}

/** One row of the plan picker. */
export interface PickerRow {
    planId: string;
    name: string;
    price: string;
    what: string;
    current: boolean;
    /** "Start 14-day trial", "Upgrade", "Switch", "Bill yearly"; null when current. */
    cta: string | null;
}

/**
 * The plan picker for one cycle: the offered plans in catalogue order, the
 * one billed marked current, each other one an upgrade (later in the list),
 * a switch (earlier), or its trial — only where this business would get one
 * (`trials`: plan ids the API quoted as a TRIAL).
 */
export function pickerRows(input: {
    catalog: Catalog;
    subscription: SarohSubscription | null;
    cycle: Cycle;
    trials: ReadonlySet<string>;
}): PickerRow[] {
    const { catalog, cycle } = input;
    const plans = offeredPlans(catalog);
    const billedId = billedPlanId(catalog, input.subscription);
    const billedAt = plans.findIndex((p) => p.id === billedId);
    const onCycle = billedCycle(input.subscription);
    return plans.map((p, i) => {
        const up = i > billedAt;
        const trialDays =
            up && p.trial?.on && p.pricePaise > 0 && input.trials.has(p.id)
                ? p.trial.days
                : null;
        const free = p.pricePaise === 0;
        const samePlan = p.id === billedId;
        const current = samePlan && (free || cycle === onCycle);
        return {
            planId: p.id,
            name: p.name,
            price: free
                ? "₹0"
                : priceWords(planPricePaise(catalog, p, cycle), cycle),
            what:
                p.tagline + (trialDays ? ` · ${trialDays}-day free trial` : ""),
            current,
            cta: current
                ? null
                : trialDays
                  ? `Start ${trialDays}-day trial`
                  : samePlan
                    ? cycle === "year"
                        ? "Bill yearly"
                        : "Bill monthly"
                    : up
                      ? "Upgrade"
                      : "Switch",
        };
    });
}

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
    /** Whether it goes on to the payment page. */
    toPayment: boolean;
}

/** A change's quote in words: what happens, when, and every amount the API sent. */
export function quoteSummary(q: ChangeQuote): QuoteSummary {
    const plan = q.plan.name;
    const recurring: QuoteLine = {
        label: `${plan}, ${q.cycle === "year" ? "yearly" : "monthly"}`,
        value: `${formatInr(q.pricePaise)} + ${formatInr(q.gstPaise)} GST = ${formatInr(q.totalPaise)} ${per(q.cycle)}`,
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
            return {
                title: `Start your ${plan} trial`,
                lead: "Nothing is charged today. Set up UPI Autopay or a card on the payment page; the first charge is taken when the trial ends. If it doesn't go through, you're back on Free.",
                lines: [
                    {
                        label: "Trial ends",
                        value: "",
                        iso: q.trialEndsAt,
                    },
                    recurring,
                    ...coupon,
                ],
                confirm: "Continue to payment",
                toPayment: true,
            };
        case "UPGRADE":
            return {
                title: `Upgrade to ${plan}`,
                lead: `You're on ${plan} from today, once you authorise it.`,
                lines: [
                    {
                        label: "Today, for the rest of this period",
                        value: `${formatInr(q.chargeNowPaise)} + ${formatInr(q.chargeNowGstPaise)} GST = ${formatInr(q.chargeNowTotalPaise)}`,
                    },
                    recurring,
                    { label: "Then from", value: "", iso: q.startAt },
                ],
                confirm: "Continue to payment",
                toPayment: true,
            };
        case "SCHEDULED":
            return {
                title: `Move to ${plan}`,
                lead: "Authorise it now; nothing is charged until it starts, and everything stays until then.",
                lines: [
                    { label: "Starts", value: "", iso: q.startAt },
                    recurring,
                ],
                confirm: "Continue to payment",
                toPayment: true,
            };
        default:
            return {
                title: `Start ${plan}`,
                lead: "You're on it once the first charge goes through on the payment page.",
                lines: [recurring, ...coupon],
                confirm: "Continue to payment",
                toPayment: true,
            };
    }
}

/** An add-on row: what one adds, and what is held. */
export interface AddonRow {
    id: string;
    name: string;
    line: string;
    total: string;
    isModule: boolean;
    quantity: number;
    available: boolean;
    why: string | null;
}

/** What one of each add-on kind adds: one, and many. */
const UNIT: Record<string, [string, string]> = {
    members: ["team member", "team members"],
    products: ["product", "products"],
    orders: ["order a month", "orders a month"],
    bookings: ["booking a month", "bookings a month"],
    integrations: ["connection", "connections"],
    blog: ["blog post", "blog posts"],
};

/** The add-ons as the design lists them; held ones first in its words. */
export function addonRows(view: AddonsView): AddonRow[] {
    return view.addons
        .filter((a) => a.available || a.quantity > 0)
        .map((a) => {
            const isModule = a.kind === "module";
            const [one, many] = UNIT[a.kind] ?? [a.kind, a.kind];
            const price = formatInr(a.pricePaise);
            return {
                id: a.id,
                name: a.name,
                isModule,
                quantity: a.quantity,
                available: a.available,
                why: a.why,
                line: isModule
                    ? `${price} a month`
                    : a.mode === "unit"
                      ? `${price} a month per ${one}`
                      : `+${a.qty} ${a.qty === 1 ? one : many} for ${price} a month`,
                total:
                    a.quantity > 0
                        ? `${isModule ? "Added" : `${a.quantity} ×`} · ${formatInr(a.heldPaise)} a month`
                        : "",
            };
        });
}
