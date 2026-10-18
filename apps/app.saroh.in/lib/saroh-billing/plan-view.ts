import { count } from "@/lib/format/plural";
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
import type { PlanNote, StatusPart } from "./plan-status";
import { nextParts } from "./plan-status";

export type { PlanNote, PlanNoteKind } from "./plan-status";

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
    /**
     * The most of it the business may hold on its plan (DEC-157). Absent
     * from an API not yet on that release: the view's `max` stands in.
     */
    max?: number;
    available: boolean;
    why: string | null;
}

export interface AddonsView {
    canBuy: boolean;
    why: string | null;
    /** The ceiling for any add-on. */
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
    /**
     * A change made during the first month (DEC-159): `NOW` — a dearer
     * plan, which ends the month and starts today at its full price;
     * `AT_END` — it waits for the month to end. Null outside a first
     * month, and absent from an API not yet on that release.
     */
    firstMonth?: "NOW" | "AT_END" | null;
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
    /**
     * The add-ons held today that end with this change (DEC-157). An API
     * from before it sends none, which reads as none ending.
     */
    addonsEnding?: EndingAddon[];
    /**
     * Whether the business has its registered address on its profile,
     * whole. False: the dialog asks for it (Saroh's invoice prints it, CGST
     * Rule 46(e)). An API from before it sends none, which asks nothing.
     */
    registeredAddress?: boolean;
    /**
     * Who Saroh bills (17 Oct 2026): what the business must give before
     * the payment opens — a name, an email, its registered address, its
     * state — and whether it has a phone (asked for, optional, when not).
     * An API from before it sends none: only `registeredAddress` is read.
     */
    billingDetails?: { missing: BillingDetail[]; phone: boolean };
}

/** What Saroh needs before it charges for a plan (17 Oct 2026). */
export type BillingDetail = "name" | "email" | "address" | "state";

/** An add-on that ends with a plan change, and how many are held. */
export interface EndingAddon {
    id: string;
    name: string;
    quantity: number;
    /** The new plan's own add-on of the kind, to add after; null: none. */
    onNewPlan: string | null;
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
    /** Razorpay's customer, for an order's window. */
    customerId?: string | null;
    /** Who is billed, kept on Razorpay's payment record. */
    notes?: Record<string, string>;
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

/**
 * What the plan it's on was approved for (DEC-093, DEC-161, #803): when its
 * autopay runs out (or the year paid ends), and whether the request to
 * approve the next is open. Not a price promise: prices can change.
 */
export interface TermView {
    endsAt: string;
    payment: PaymentKind;
    renewOpen: boolean;
    /**
     * Monthly charges the autopay covers (1 for a year paid once). Absent
     * from an API before DEC-161, which made every autopay for 12.
     */
    charges?: number;
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

export interface YourPlanView {
    name: string;
    /** "₹111 a month + GST", "₹0"; null on a plan given for a while. */
    price: string | null;
    /** On a plan given for a while (a launch offer): free until this. */
    freeUntil: string | null;
    includes: string;
    /** "You're on the pricing from version 2.", or "" on the live one. */
    versionNote: string;
    next: NextCharge;
    /** After "You're on ‹plan›" on the status line: what happens next. */
    status: StatusPart[];
    method: string | null;
    notes: PlanNote[];
    /**
     * A checkout waiting for its payment (DEC-093): confirmed with Razorpay
     * on the page, never started again — that would be a second mandate.
     */
    pending: PendingCheckout | null;
    /**
     * "Cancel plan" (owner, 17 Oct 2026): offered while the business is on
     * a paid plan it is billed for and isn't already leaving. Null: no
     * such button. Who may press it (`billing:manage`) is the page's.
     */
    cancel: CancelOffer | null;
}

/** What "Cancel plan" needs: the plan kept until the end, and Free's id. */
export interface CancelOffer {
    planName: string;
    freePlanId: string;
    freePlanName: string;
    /** A year paid once (no autopay), else monthly autopay. */
    yearly: boolean;
}

/**
 * Whether "Cancel plan" is offered (owner, 17 Oct 2026). Only a paid
 * catalogue plan the business is billed for through a provider, on
 * `TRIALING`, `ACTIVE` or `PAST_DUE`, and only while nothing already ends
 * it: not when Free (or another plan) already waits for the period's end,
 * not under a plan given for a while (its own note says where it lands),
 * and not while a year paid once is scheduled to start, whatever the
 * cycle now (moving to Free would give that paid year up; the API refuses
 * it with a 409).
 * See `backend-billing-and-classes.md` › Cancelling a plan.
 */
export function cancelOffer(input: {
    catalog: Catalog | null;
    subscription: SarohSubscription | null;
    access: Pick<BillingAccessView, "plan" | "pendingMove" | "planOverride">;
    checkouts: CheckoutsView | null;
}): CancelOffer | null {
    const { catalog, subscription: sub, access } = input;
    if (!catalog || !sub) return null;
    if (!["TRIALING", "ACTIVE", "PAST_DUE"].includes(sub.status)) return null;
    if (!sub.provider || sub.plan.priceCents <= 0) return null;
    if (sub.cancelAtPeriodEnd) return null;
    const billedId = catalogPlanIdForKey(sub.plan.key);
    const billed = catalog.plans.find((p) => p.id === billedId);
    if (!billed || billed.pricePaise <= 0) return null;
    const free = catalog.plans.find((p) => p.pricePaise === 0 && !p.retired);
    if (!free) return null;
    const override = access.planOverride;
    if (override !== null && override.planKey !== billedId) return null;
    const move = access.pendingMove;
    if (move && move.planId !== move.fromPlanId) return null;
    const yearly = billedCycle(sub) === "year";
    // A year already paid for and waiting to start (a renewal, or a move
    // from monthly to yearly): moving to Free would give that paid year up,
    // so the API refuses it and the button isn't shown. An approved monthly
    // autopay that hasn't charged yet stops with the rest.
    const scheduled = input.checkouts?.scheduled ?? null;
    if (scheduled && (yearly || scheduled.payment === "ONE_TIME")) return null;
    return {
        planName: billed.name,
        freePlanId: free.id,
        freePlanName: free.name,
        yearly,
    };
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

    const versionNote =
        access.version !== null &&
        input.liveVersion !== null &&
        access.version !== input.liveVersion
            ? `You're on the pricing from version ${access.version}.`
            : "";
    const includes =
        (row?.tagline ?? "") + (versionNote ? ` · ${versionNote}` : "");

    const notes: PlanNote[] = [];
    let next: NextCharge = { kind: "text", text: "Nothing to pay" };
    let firstMonth = false;

    const move = access.pendingMove;
    // Only the version changes (Free v1 to Free v2): not a plan change, so
    // nothing says one (N1).
    const samePlan = move !== null && move.planId === move.fromPlanId;

    if (given) {
        // Where it lands when the plan given ends: a pending move's plan.
        const then = planName(
            catalog,
            move && !samePlan ? move.planId : (billedId ?? "free"),
        );
        notes.push(
            override.expiresAt
                ? {
                      kind: "given",
                      tone: "info",
                      lead: `${name} is yours, free, until `,
                      iso: override.expiresAt,
                      tail: `. Then you're on ${then} unless you choose a plan below.`,
                      action: null,
                  }
                : {
                      kind: "given",
                      tone: "info",
                      lead: `${name} is yours, free, until Saroh changes it.`,
                      iso: null,
                      tail: "",
                      action: null,
                  },
        );
    }

    if (sub?.status === "CANCELLED") {
        next = { kind: "text", text: "Nothing to pay. The plan has ended" };
    } else if (sub?.status === "PAST_DUE") {
        next = { kind: "text", text: "Payment overdue" };
        notes.push({
            kind: "overdue",
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
            firstMonth = true;
            notes.push({
                kind: "firstMonth",
                tone: "info",
                lead: "Your first month runs to ",
                iso: sub.currentPeriodEnd,
                tail: ", when the first full charge is taken. If it doesn't go through, you're back on Free.",
                action: null,
            });
        }
    }

    // A plan given for a while wins until it ends: the move happens under
    // it, and the note above already says where it lands (N1).
    const underOverride =
        given &&
        (override.expiresAt === null ||
            (move !== null && override.expiresAt > move.from));
    // A new price for the plan it pays for (DEC-161): no price lock, at
    // least 30 days' notice, and the business approves the new amount.
    // Until it does, it keeps paying what it pays.
    const newPrice =
        move &&
        samePlan &&
        !given &&
        paise > 0 &&
        move.pricePaise !== undefined &&
        move.pricePaise > 0 &&
        move.pricePaise !== paise
            ? `${priceWords(move.pricePaise, yearlyPaise !== null ? "year" : "month")} + GST`
            : null;
    if (move?.waiting === "authorise") {
        // Due, and waiting on the business: the one move that needs a tap.
        const to = planName(catalog, move.planId);
        notes.push({
            kind: "authorise",
            tone: "attention",
            lead: samePlan
                ? `${to}'s new price${newPrice ? `, ${newPrice},` : ""} was due to start on `
                : `Your plan was due to move to ${to} on `,
            iso: move.from,
            tail: samePlan
                ? `. Approve the new amount to move to it. Until you do, you keep paying ${priceText}.`
                : `. Approve the new amount to move. Until then you stay on ${name}.`,
            action: { label: "Approve", planId: move.planId, cycle },
        });
    } else if (
        move &&
        newPrice &&
        move.waiting !== "held" &&
        // Approved already: the note below says when it starts.
        input.checkouts?.scheduled?.plan.id !== planId
    ) {
        // Approving quotes the live row: offered once its version is live.
        const live =
            input.liveVersion !== null && move.version <= input.liveVersion;
        notes.push({
            kind: "priceChange",
            tone: "attention",
            lead: `${name}'s price changes to ${newPrice} on `,
            iso: move.from,
            tail: live
                ? `. Approve the new amount before then. Until you do, you keep paying ${priceText}.`
                : `. We'll ask you to approve the new amount. Until you do, you keep paying ${priceText}.`,
            action: live
                ? { label: "Approve", planId: move.planId, cycle }
                : null,
        });
    } else if (move && !samePlan && !underOverride) {
        const to = planName(catalog, move.planId);
        if (move.waiting === "held") {
            notes.push({
                kind: "move",
                tone: "info",
                lead: `Your plan moves to ${to} from `,
                iso: move.from,
                tail: ". It's waiting on Saroh and applies on its own. Everything stays until then.",
                action: null,
            });
        } else {
            notes.push({
                kind: "move",
                tone: "info",
                lead: `Your plan changes to ${to} on `,
                iso: move.from,
                tail: ". Everything stays until then.",
                action: null,
            });
        }
    }
    const scheduled = input.checkouts?.scheduled ?? null;
    // The same plan scheduled is its renewal (DEC-093), or its new price
    // approved (DEC-161).
    const renewed = scheduled !== null && scheduled.plan.id === planId;
    if (scheduled && (!move || samePlan || renewed)) {
        notes.push(
            renewed
                ? {
                      kind: "renewed",
                      tone: "info",
                      lead:
                          scheduled.payment === "ONE_TIME"
                              ? `Your next year of ${name} starts on `
                              : `Your next autopay for ${name} starts on `,
                      iso: scheduled.startAt,
                      tail: ", as you approved.",
                      action: null,
                  }
                : {
                      kind: "scheduled",
                      tone: "info",
                      lead: `${scheduled.plan.name} starts on `,
                      iso: scheduled.startAt,
                      tail: ", as you approved. Everything stays until then.",
                      action: null,
                  },
        );
    }

    // How long the autopay runs (DEC-093, DEC-161, #803): when it runs out,
    // and the request to approve the next in its last days. Left alone, the
    // plan runs to the end and then it's Free. Not a price promise. A plan
    // the business is leaving has no charges left to run (DEC-159).
    const leaving = Boolean(sub?.cancelAtPeriodEnd) && !term?.renewOpen;
    if (term && !given && !renewed && !leaving) {
        const year = term.payment === "ONE_TIME";
        const charges = term.charges ?? 12;
        notes.push(
            term.renewOpen
                ? {
                      kind: "renew",
                      tone: "attention",
                      lead: year
                          ? "The year you paid for ends on "
                          : `Your autopay for ${name} runs out on `,
                      iso: term.endsAt,
                      tail: year
                          ? `. Pay for the next year to keep ${name} from that day, at today's price. Otherwise you move to Free then.`
                          : `. Approve the next one to keep ${name} from that day, at today's price. Otherwise you move to Free then.`,
                      action: {
                          label: year ? "Renew" : "Approve",
                          planId,
                          cycle,
                      },
                  }
                : {
                      kind: "term",
                      tone: "info",
                      lead: year
                          ? "Paid for the year, to "
                          : `Your autopay covers ${charges} monthly charges, to `,
                      iso: term.endsAt,
                      tail: year
                          ? ". Before it ends, we ask you to pay for the next year."
                          : ". Before it runs out, we ask you to approve the next one.",
                      action: null,
                  },
        );
    }

    const open = input.checkouts?.open;

    // A plan given for a while says so before what is charged: nothing is.
    const status: StatusPart[] = [
        ...(given
            ? [
                  override.expiresAt
                      ? { lead: "Free until ", iso: override.expiresAt }
                      : { lead: "Free until Saroh changes it" },
              ]
            : []),
        ...nextParts(next, {
            firstMonth,
            cycle: yearlyPaise !== null ? "year" : "month",
            price: given ? null : priceText,
        }),
    ];

    return {
        name,
        price: given ? null : priceText,
        freeUntil: given ? (override.expiresAt ?? null) : null,
        includes,
        versionNote,
        next,
        status,
        method: sub?.provider
            ? `Paid through ${PROVIDER_NAMES[sub.provider] ?? sub.provider}`
            : null,
        notes,
        pending: open
            ? {
                  planName: open.plan.name,
                  expiresAt: open.expiresAt,
                  handoff: open.handoff ?? null,
              }
            : null,
        cancel: cancelOffer(input),
    };
}

/**
 * A plan card's button, in words that say what it does: "Upgrade to Plan C"
 * (starts today), "Move to Plan A from ‹date›" (waits for what is paid to
 * run out, DEC-159), "Start Plan B", "Start with the first month", "Start
 * 14-day trial", "Bill yearly", "Keep Plan B".
 */
export interface PlanCta {
    label: string;
    /** The date the label ends with, after "from "; null: none. */
    iso: string | null;
    /** A move up: the filled button. Anything else is the quiet one. */
    primary: boolean;
}

/** One plan of the plan picker: a card. */
export interface PickerRow {
    planId: string;
    name: string;
    /** "₹111 a month + GST", or "₹0". */
    price: string;
    /** The same, in two sizes: "₹111", then "a month + GST" ("" on ₹0). */
    amount: string;
    per: string;
    /** Who it's for: the catalogue's one line. */
    what: string;
    /** "First month ₹1 + GST" or "14-day free trial", only where this business would get it. */
    offer: string | null;
    current: boolean;
    /** Null when there's nothing to do: the plan it's on, or one that already waits. */
    cta: PlanCta | null;
    /** A change to this plan already waits for this date; the card says so in the button's place. */
    scheduled: string | null;
    /** The catalogue card's lead ("Everything in Plan A, plus:") and every line of it. */
    lead: string;
    lines: string[];
    /**
     * Where the business stands with it: under a plan given for a while,
     * or when a change to it would start (DEC-159). Words around one date.
     * `brief` is the same without the date, for under a button or a state
     * that has just said it.
     */
    note: {
        lead: string;
        iso: string | null;
        tail?: string;
        brief?: string;
    } | null;
}

/** What `GET …/billing/change-plan` said of one plan, as a row needs it. */
export type RowQuote = Pick<
    ChangeQuote,
    "kind" | "effectiveAt" | "firstMonth" | "payNowTotalPaise"
>;

/** A change already made that waits for its date: the plan, and from when. */
export interface WaitingMove {
    planId: string;
    iso: string;
    /** The cycle it was authorised on; null: a free plan, which has none. */
    cycle: Cycle | null;
}

/**
 * The change that waits for the end of what is paid (DEC-159): the plan
 * the business authorised for that date, else the move its plan is on
 * course for (Free it chose, a cheaper plan). Null when nothing waits, or
 * only its own plan's renewal or next version does.
 */
export function waitingMove(input: {
    access: Pick<BillingAccessView, "plan" | "pendingMove">;
    checkouts: CheckoutsView | null;
}): WaitingMove | null {
    const onId = input.access.plan?.id ?? null;
    const scheduled = input.checkouts?.scheduled ?? null;
    if (scheduled?.startAt && scheduled.plan.id !== onId) {
        return {
            planId: scheduled.plan.id,
            iso: scheduled.startAt,
            cycle: scheduled.cycle === "year" ? "year" : "month",
        };
    }
    const move = input.access.pendingMove;
    if (!move || move.planId === move.fromPlanId || move.waiting) return null;
    return { planId: move.planId, iso: move.from, cycle: null };
}

/**
 * The plan picker for one cycle: the offered plans in catalogue order, the
 * one billed marked current, each other one an upgrade (later in the list),
 * a switch (earlier), or its trial — only where this business would get one
 * (`trials`: plan ids the API quoted as a TRIAL). Each says what it unlocks,
 * from the catalogue's own card lines, all of them (UX-045).
 *
 * When a change would start is the API's (`quotes`, DEC-159): a dearer plan
 * "Starts today" with what is paid now, and any other "From ‹date›", the
 * end of what is paid, with the plan kept until then. The button says the
 * same: "Upgrade to ‹plan›", or "Move to ‹plan› from ‹date›". A change that
 * already waits (`waiting`) says so on its card, with no button to make it
 * twice.
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
    /** The API's quote for each plan on this cycle; none: no timing said. */
    quotes?: ReadonlyMap<string, RowQuote>;
    /** A change already made that waits for its date. */
    waiting?: WaitingMove | null;
    /** The clock, for "is that date still ahead". */
    now?: Date;
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
    const onName = plans[onAt]?.name ?? "your plan";
    const now = input.now ?? new Date();
    const kept = `You keep ${onName} until then.`;
    const keep = `: you keep ${onName} until then.`;
    // Nothing is paid for yet: a paid plan is started, not upgraded to.
    const onFree =
        (plans.find((p) => p.id === billedId)?.pricePaise ?? 0) === 0;
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
        // This plan, on this cycle, is where a change already made lands.
        const awaited =
            input.waiting?.planId === p.id &&
            (input.waiting.cycle === null || input.waiting.cycle === cycle)
                ? input.waiting
                : null;
        const quoted = current ? undefined : input.quotes?.get(p.id);
        const later =
            quoted &&
            (quoted.kind === "SCHEDULED" || quoted.kind === "TO_FREE") &&
            quoted.effectiveAt &&
            new Date(quoted.effectiveAt) > now
                ? quoted.effectiveAt
                : null;
        const today =
            quoted &&
            (quoted.kind === "UPGRADE" || quoted.firstMonth === "NOW") &&
            quoted.payNowTotalPaise > 0
                ? `Starts today: ${formatInr(quoted.payNowTotalPaise)} now (incl. GST)`
                : null;
        const timing = awaited
            ? { lead: "From ", iso: awaited.iso, tail: keep, brief: kept }
            : later
              ? { lead: "From ", iso: later, tail: keep, brief: kept }
              : today
                ? {
                      lead:
                          quoted?.firstMonth === "NOW"
                              ? `${today}. Your first month on ${onName} ends.`
                              : today,
                      iso: null,
                  }
                : null;
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
              : givenId
                ? null
                : timing;
        const pricePaise = planPricePaise(catalog, p, cycle);
        const scheduled = awaited && !givenId ? awaited.iso : null;
        const quiet = (label: string): PlanCta => ({
            label: later ? `${label} from ` : label,
            iso: later,
            primary: false,
        });
        const cta: PlanCta | null = held
            ? { label: `Keep ${p.name}`, iso: null, primary: false }
            : current || (givenId && samePlan) || scheduled
              ? null
              : firstPaise > 0
                ? {
                      label: "Start with the first month",
                      iso: null,
                      primary: true,
                  }
                : trialDays
                  ? {
                        label: `Start ${trialDays}-day trial`,
                        iso: null,
                        primary: true,
                    }
                  : samePlan
                    ? quiet(cycle === "year" ? "Bill yearly" : "Bill monthly")
                    : up && !later
                      ? {
                            label: onFree
                                ? `Start ${p.name}`
                                : `Upgrade to ${p.name}`,
                            iso: null,
                            primary: true,
                        }
                      : quiet(`Move to ${p.name}`);
        return {
            planId: p.id,
            name: p.name,
            price: free ? "₹0" : `${priceWords(pricePaise, cycle)} + GST`,
            amount: free ? "₹0" : formatInr(pricePaise),
            per: free ? "" : `${per(cycle)} + GST`,
            what: p.tagline,
            offer:
                firstPaise > 0
                    ? `First month ${formatInr(firstPaise)} + GST`
                    : trialDays
                      ? `${trialDays}-day free trial`
                      : null,
            current,
            cta,
            scheduled,
            lead: card.lead,
            lines: card.lines.map((l) => l.t),
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
    /** No more than this can be held; what is held may already be more. */
    max: number;
    available: boolean;
    why: string | null;
}

/** What one of each add-on kind adds: one, and many. */
const UNIT: Record<string, [string, string]> = {
    members: ["team member", "team members"],
    products: ["product", "products"],
    orders: ["order a month", "orders a month"],
    // Online ones only (DEC-095): the team's own bookings are never capped.
    bookings: ["online booking a month", "online bookings a month"],
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
            const max = a.max ?? view.max;
            // Said only where the plan sets its own, below the ceiling.
            const upTo = !isModule && max < view.max ? `, up to ${max}` : "";
            return {
                id: a.id,
                name: a.name,
                isModule,
                quantity: a.quantity,
                max,
                available: a.available,
                why: a.why,
                line: isModule
                    ? `${price} a month`
                    : a.mode === "unit"
                      ? `${price} a month per ${one}${upTo}`
                      : `+${count(a.qty, one, many)} for ${price} a month${upTo}`,
                total:
                    a.quantity > 0
                        ? `${isModule ? "Added" : `${a.quantity} ×`} · ${formatInr(a.heldPaise)} a month`
                        : "",
            };
        });
}
