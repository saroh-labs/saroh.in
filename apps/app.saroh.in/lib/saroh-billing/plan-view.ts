import type { Catalog } from "@saroh/pricing-catalog";
import {
    cardLines,
    catalogPlanIdForKey,
    formatInr,
    offeredPlans,
    planPricePaise,
    trialFirstPaise,
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
    "NONE" | "TO_FREE" | "NEW" | "UPGRADE" | "SCHEDULED" | "TRIAL" | "RENEW";

/** Monthly autopay, or yearly's one payment (DEC-093). */
export type PaymentKind = "AUTOPAY" | "ONE_TIME";

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
    /** How it's paid, and for how many charges (DEC-093). */
    payment: PaymentKind;
    termCharges: number;
    /** Exactly what is taken today, GST included. */
    payNowTotalPaise: number;
    /** What setting up autopay takes now: a real charge, a refunded check, or none. */
    mandateCheck: "PAID" | "REFUNDED" | "NONE";
}

/**
 * What opens Razorpay's own checkout window over the page (DEC-093): its
 * public key, the subscription or order, and the owner's details
 * pre-filled. Never a secret.
 */
export interface CheckoutHandoff {
    provider: string;
    keyId: string;
    subscriptionId: string | null;
    orderId: string | null;
    amountPaise: number | null;
    currency: string;
    prefill: {
        name: string | null;
        email: string | null;
        contact: string | null;
    };
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
    payment?: PaymentKind;
}

/** The 12-month term of the plan it's on (DEC-093, #803). */
export interface TermView {
    endsAt: string;
    payment: PaymentKind;
    renewOpen: boolean;
}

export interface CheckoutsView {
    open: (CheckoutView & { handoff?: CheckoutHandoff | null }) | null;
    scheduled: CheckoutView | null;
    term?: TermView | null;
}

/** `POST …/billing/change-plan`. */
export type ChangeResult =
    | { kind: "TO_FREE"; effectiveAt: string }
    | {
          kind: "NEW" | "UPGRADE" | "SCHEDULED" | "TRIAL" | "RENEW";
          authorisationUrl: string | null;
          handoff: CheckoutHandoff | null;
      };

/** `POST …/billing/checkout/confirm`: where a checkout stands. */
export interface ConfirmResult {
    state: "completed" | "scheduled" | "waiting" | "failed" | "none";
    plan: { id: string; name: string } | null;
    startAt: string | null;
}

const per = (cycle: Cycle) => (cycle === "year" ? "a year" : "a month");

/** The cycle a subscription is billed on. */
export function billedCycle(sub: SarohSubscription | null): Cycle {
    return sub?.billingCycle === "year" ? "year" : "month";
}

/** "₹111 a month", "₹1,110 a year", or "₹0". */
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
    /** "₹111 a month + GST", "₹0"; null on a plan given for a while. */
    price: string | null;
    /** On a plan given for a while (a launch offer): free until this. */
    freeUntil: string | null;
    includes: string;
    next: NextCharge;
    method: string | null;
    notes: PlanNote[];
    /**
     * A checkout waiting for its payment (DEC-093): confirmed with Razorpay
     * on the page, never started again — that would be a second mandate.
     */
    pending: PendingCheckout | null;
}

export interface PendingCheckout {
    planName: string;
    expiresAt: string;
    /** Reopens the same payment window; null when there's none to open. */
    handoff: CheckoutHandoff | null;
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
    const term = input.checkouts?.term ?? null;
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
    } else if (!given && paise > 0 && term?.payment === "ONE_TIME") {
        // A year paid once: nothing more is charged (DEC-093).
        next = { kind: "paidTo", iso: term.endsAt };
    } else if (!given && paise > 0 && sub?.currentPeriodEnd) {
        next = {
            kind: "charge",
            iso: sub.currentPeriodEnd,
            amount: `${formatInr(paise)} + GST${input.addonsHeld ? " + add-ons" : ""}`,
        };
        if (sub.status === "TRIALING") {
            notes.push({
                tone: "info",
                lead: "Your first month runs to ",
                iso: sub.currentPeriodEnd,
                tail: ", when the first full charge is taken. If it doesn't go through, you're back on Free.",
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
    }
    const scheduled = input.checkouts?.scheduled ?? null;
    // The same plan scheduled is its renewal (DEC-093).
    const renewed = scheduled !== null && scheduled.plan.id === planId;
    if (scheduled && (!move || renewed)) {
        notes.push(
            renewed
                ? {
                      tone: "info",
                      lead: `Your next 12 months of ${name} start on `,
                      iso: scheduled.startAt,
                      tail: ", as you authorised.",
                      action: null,
                  }
                : {
                      tone: "info",
                      lead: `${scheduled.plan.name} starts on `,
                      iso: scheduled.startAt,
                      tail: ", as you authorised. Everything stays until then.",
                      action: null,
                  },
        );
    }

    // The term (DEC-093, #803): when it ends, and the one-tap renewal in its
    // last days. Left alone, the plan runs to the end and then it's Free.
    if (term && !given && !renewed) {
        const year = term.payment === "ONE_TIME";
        notes.push(
            term.renewOpen
                ? {
                      tone: "attention",
                      lead: year
                          ? "The year you paid for ends on "
                          : `Your 12 months of ${name} end on `,
                      iso: term.endsAt,
                      tail: `. Renew to keep ${name} from that day, at today's price; otherwise you move to Free then.`,
                      action: { label: "Renew", planId, cycle },
                  }
                : {
                      tone: "info",
                      lead: year
                          ? "Paid for the year, to "
                          : "Your 12 monthly charges run to ",
                      iso: term.endsAt,
                      tail: ". You can renew with one tap in the last month.",
                      action: null,
                  },
        );
    }

    const open = input.checkouts?.open;

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
        pending: open
            ? {
                  planName: open.plan.name,
                  expiresAt: open.expiresAt,
                  handoff: open.handoff ?? null,
              }
            : null,
    };
}

/** One row of the plan picker. */
export interface PickerRow {
    planId: string;
    name: string;
    /** "₹111 a month + GST", or "₹0". */
    price: string;
    what: string;
    current: boolean;
    /** "Start 14-day trial", "Upgrade", "Switch", "Bill yearly", "Keep Plan B"; null when there's nothing to do. */
    cta: string | null;
    /** The catalogue card's lead ("Everything in Plan A, plus:") and its first lines. */
    lead: string;
    lines: string[];
    /** Where the business stands with it under a plan given for a while. */
    note: { lead: string; iso: string | null } | null;
}

/** How many of a plan card's lines the picker shows. */
export const PICKER_LINES = 4;

/**
 * The plan picker for one cycle: the offered plans in catalogue order, the
 * one billed marked current, each other one an upgrade (later in the list),
 * a switch (earlier), or its trial — only where this business would get one
 * (`trials`: plan ids the API quoted as a TRIAL). Each says what it unlocks,
 * from the catalogue's own card lines (UX-045).
 *
 * Under a plan given for a while (a launch offer, UX-044), that plan is the
 * one it's on — "You're on this until …", no trial on it — and the plan it's
 * billed for is what comes "After …".
 */
export function pickerRows(input: {
    catalog: Catalog;
    subscription: SarohSubscription | null;
    cycle: Cycle;
    trials: ReadonlySet<string>;
    /** A plan given for a while, and until when (null: until changed). */
    given?: { planId: string; until: string | null } | null;
}): PickerRow[] {
    const { catalog, cycle } = input;
    const plans = offeredPlans(catalog);
    const billedId = billedPlanId(catalog, input.subscription);
    const givenId =
        input.given && input.given.planId !== billedId
            ? input.given.planId
            : null;
    const onId = givenId ?? billedId;
    const onAt = plans.findIndex((p) => p.id === onId);
    const onCycle = billedCycle(input.subscription);
    return plans.map((p, i) => {
        const up = i > onAt;
        const held = p.id === givenId;
        // Monthly only: yearly is one payment and has no trial (DEC-093).
        const trialDays =
            up &&
            !held &&
            cycle === "month" &&
            p.trial?.on &&
            p.pricePaise > 0 &&
            input.trials.has(p.id)
                ? p.trial.days
                : null;
        // A first month that costs something isn't a free trial.
        const firstPaise = trialDays ? trialFirstPaise(p) : 0;
        const free = p.pricePaise === 0;
        const samePlan = p.id === billedId;
        const current =
            held || (samePlan && !givenId && (free || cycle === onCycle));
        const card = cardLines(catalog, p.id);
        const note = held
            ? {
                  lead: input.given?.until
                      ? "You're on this until "
                      : "You're on this for now",
                  iso: input.given?.until ?? null,
              }
            : givenId && samePlan
              ? input.given?.until
                  ? { lead: "After ", iso: input.given.until }
                  : null
              : null;
        return {
            planId: p.id,
            name: p.name,
            price: free
                ? "₹0"
                : `${priceWords(planPricePaise(catalog, p, cycle), cycle)} + GST`,
            what:
                p.tagline +
                (firstPaise > 0
                    ? ` · first month ${formatInr(firstPaise)} + GST`
                    : trialDays
                      ? ` · ${trialDays}-day free trial`
                      : ""),
            current,
            cta: held
                ? `Keep ${p.name}`
                : current || (givenId && samePlan)
                  ? null
                  : firstPaise > 0
                    ? "Start with the first month"
                    : trialDays
                      ? `Start ${trialDays}-day trial`
                      : samePlan
                        ? cycle === "year"
                            ? "Bill yearly"
                            : "Bill monthly"
                        : up
                          ? "Upgrade"
                          : "Switch",
            lead: card.lead,
            lines: card.lines.slice(0, PICKER_LINES).map((l) => l.t),
            note,
        };
    });
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
