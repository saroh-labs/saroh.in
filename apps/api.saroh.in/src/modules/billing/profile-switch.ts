import { ConflictException } from "@nestjs/common";
import type { BillingCheckout, Plan, Prisma } from "@saroh/database";

import { isOneTime } from "./billing-term";
import { renewsAtProvider } from "./business-closing";
import { billedByProvider, paidUntil } from "./change-timing";
import { periodEnd } from "./checkout-quote";
import { enqueueProviderCancel } from "./provider-cancel.job";
import { FIRST_MONTH_KEY } from "./saroh-invoice-terms";

type Tx = Prisma.TransactionClient;
type Db = Pick<Tx, "organization" | "billingCheckout">;

/**
 * Moving a paid business to another billing profile (DEC-167, R13, U6).
 *
 * A business whose provider subscription charges again is billed to its
 * profile's customer until the period it paid for ends, so the move waits
 * for the renewal: a SCHEDULED checkout for the same plan and cycle, made
 * on the new profile's customer and starting when the period ends — the
 * path a cheaper plan already takes (DEC-161). Authorised, the old
 * subscription is told to end with its period (the webhook); at the
 * renewal `applyDueMoveInTx` adopts the new one and points the business
 * at the new profile. Never authorised, the checkout lapses like any other
 * and nothing changes: the business stays on its profile and its
 * subscription renews, or runs out, as it would have.
 *
 * **One scheduled checkout carries both** a plan change and a profile
 * switch made before the same renewal. The partial unique index keeps one
 * OPEN and one SCHEDULED per business, and an authorised checkout
 * supersedes any SCHEDULED one (`completeCheckout`), so:
 *
 * - a switch while a plan change is already authorised is a new checkout
 *   for that plan, from its date, on the new profile; the plan change
 *   stays as it is until the switch is authorised, then gives way to it;
 * - a plan change starting at the renewal while a switch waits is made on
 *   the profile it is moving to (`CheckoutService.changePlan`).
 *
 * Choosing the profile it is billed from at the renewal again gives up a
 * switch still waiting for authorisation (and its provider subscription).
 * Once authorised, the old subscription has been told to end, so staying
 * on the profile is a switch back, authorised again.
 */

/** The checkouts in play, and which of them move the business's profile. */
export interface ProfileSwitchState {
    /** The profile the business is billed to now. */
    current: string | null;
    /** Waiting for authorisation. */
    open: BillingCheckout | null;
    /** Authorised, waiting for its date. */
    scheduled: BillingCheckout | null;
    /** The authorised checkout, when it is on another profile. */
    scheduledSwitch: BillingCheckout | null;
    /** The profile it is billed to from the renewal, as authorised now. */
    settled: string | null;
    /** The waiting checkout, when it would move the business on from `settled`. */
    openSwitch: BillingCheckout | null;
}

export async function profileSwitchStateInTx(
    db: Db,
    organizationId: string,
): Promise<ProfileSwitchState> {
    const [org, live] = await Promise.all([
        db.organization.findUnique({
            where: { id: organizationId },
            select: { billingProfileId: true },
        }),
        db.billingCheckout.findMany({
            where: { organizationId, status: { in: ["OPEN", "SCHEDULED"] } },
        }),
    ]);
    const current = org?.billingProfileId ?? null;
    const open = live.find((c) => c.status === "OPEN") ?? null;
    const scheduled = live.find((c) => c.status === "SCHEDULED") ?? null;
    const scheduledSwitch =
        scheduled?.billingProfileId && scheduled.billingProfileId !== current
            ? scheduled
            : null;
    const settled = scheduledSwitch?.billingProfileId ?? current;
    // Only a change from the renewal (an upgrade or a new plan starts now,
    // on the profile billed now).
    const openSwitch =
        open?.kind === "SCHEDULED" &&
        open.billingProfileId &&
        open.billingProfileId !== settled
            ? open
            : null;
    return { current, open, scheduled, scheduledSwitch, settled, openSwitch };
}

/**
 * The profile a change starting at the renewal is billed to: the one a
 * switch is moving the business to, else null (the business's own).
 */
export function renewalProfileOf(state: ProfileSwitchState): string | null {
    return (
        state.openSwitch?.billingProfileId ??
        state.scheduledSwitch?.billingProfileId ??
        null
    );
}

/** The switch the business's Plan & billing names, if one is in play. */
export function pendingSwitchOf(state: ProfileSwitchState): {
    billingProfileId: string;
    at: Date | null;
    authorised: boolean;
} | null {
    const c = state.openSwitch ?? state.scheduledSwitch;
    if (!c?.billingProfileId) return null;
    return {
        billingProfileId: c.billingProfileId,
        at: c.startAt,
        authorised: c === state.scheduledSwitch,
    };
}

export const CHECKOUT_WAITING = "checkout-waiting";
export const CHECKOUT_WAITING_MESSAGE =
    "A payment is waiting under this billing profile. Finish it or let it lapse, then choose another.";
export const PAID_YEAR_WAITING = "paid-year-waiting";
export const PAID_YEAR_WAITING_MESSAGE =
    "Your next year is already paid under this billing profile. Choose another once it has started.";
export const PAYMENT_DUE = "payment-due";
export const PAYMENT_DUE_MESSAGE =
    "This plan's last payment hasn't gone through. Once it's paid, you can choose another billing profile.";

export const DISCOUNT_RUNNING = "discount-running";
/** Said while a coupon still comes off charges to come (owner, 18 Oct 2026). */
export function discountRunningMessage(until: Date): string {
    const day = until.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    });
    return `Your discount runs until ${day}. You can move to another billing profile after that.`;
}

function refuse(code: string, message: string): never {
    throw new ConflictException({
        message,
        details: { field: "billingProfile", code },
    });
}

/** What choosing a profile does to the business. */
export type ProfileMove =
    /** Already billed to it, from now and from the renewal. */
    | { kind: "none" }
    /** Nothing more is charged at the provider: billed to it from now. */
    | { kind: "applied"; from: string | null }
    /** A switch waiting for authorisation, given up. */
    | { kind: "kept"; dropped: string }
    /** A scheduled checkout to make, on the profile, for this plan. */
    | { kind: "schedule"; from: string | null; plan: Plan; startAt: Date };

/**
 * What choosing `to` for the business does, decided under the
 * subscription's lock, on the caller's transaction. Applying at once and
 * giving up a waiting switch are done here; a switch to schedule is
 * returned for `CheckoutService.startProfileSwitch`, which makes its
 * provider subscription outside any transaction.
 */
export async function profileMoveInTx(
    tx: Tx,
    organizationId: string,
    to: string,
    now: Date,
): Promise<ProfileMove> {
    await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
    const state = await profileSwitchStateInTx(tx, organizationId);
    const { current, open, scheduled } = state;
    const sub = await tx.subscription.findUnique({
        where: { organizationId },
        select: {
            status: true,
            provider: true,
            providerSubscriptionId: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            billingCycle: true,
            planId: true,
            pendingPlanId: true,
            pendingFrom: true,
            plan: { select: { priceCents: true } },
        },
    });

    // A year already paid, waiting to start, is that profile's.
    if (scheduled && isOneTime(scheduled)) {
        if (to === state.settled && !state.openSwitch) return { kind: "none" };
        refuse(PAID_YEAR_WAITING, PAID_YEAR_WAITING_MESSAGE);
    }
    const renews =
        Boolean(scheduled) ||
        (sub !== null &&
            billedByProvider(sub) &&
            !sub.cancelAtPeriodEnd &&
            (await renewsAtProvider(tx, sub)));

    if (!renews) {
        // Nothing more is charged on the current profile's customer.
        if (to === current) return { kind: "none" };
        if (open) refuse(CHECKOUT_WAITING, CHECKOUT_WAITING_MESSAGE);
        await tx.organization.update({
            where: { id: organizationId },
            data: { billingProfileId: to },
        });
        return { kind: "applied", from: current };
    }

    // No profile billed today (the data move left it none): there is no
    // profile to move from, so the choice applies at once — invoices are
    // addressed to it from now, and the next checkout uses its customer.
    if (current === null && !state.scheduledSwitch && !state.openSwitch) {
        if (open) refuse(CHECKOUT_WAITING, CHECKOUT_WAITING_MESSAGE);
        await tx.organization.update({
            where: { id: organizationId },
            data: { billingProfileId: to },
        });
        return { kind: "applied", from: null };
    }

    if (to === state.settled) {
        if (!state.openSwitch?.billingProfileId) return { kind: "none" };
        await giveUpInTx(tx, state.openSwitch, "profile-kept");
        return { kind: "kept", dropped: state.openSwitch.billingProfileId };
    }
    // A payment for a plan, waiting on the profile billed now.
    if (open && !state.openSwitch) {
        refuse(CHECKOUT_WAITING, CHECKOUT_WAITING_MESSAGE);
    }
    // The plan it moves to at the renewal: one authorised already (a plan
    // change, or a renewal), else a move Saroh is making ("move them"),
    // else the plan it is on.
    const moving =
        sub?.pendingPlanId && sub.pendingFrom && !sub.cancelAtPeriodEnd
            ? { planId: sub.pendingPlanId, from: sub.pendingFrom }
            : null;
    const planId = scheduled?.planId ?? moving?.planId ?? sub?.planId;
    const startAt =
        scheduled?.startAt ?? moving?.from ?? paidUntil(sub, now) ?? null;
    if (!planId || !startAt || startAt.getTime() <= now.getTime()) {
        refuse(PAYMENT_DUE, PAYMENT_DUE_MESSAGE);
    }
    // A coupon is the provider subscription's (its offer): a switch makes
    // a new one at the full price, so it waits until the discount is used
    // (the minimal default; owner, 18 Oct 2026).
    const discountUntil = await discountRunsUntilInTx(
        tx,
        organizationId,
        sub,
        scheduled,
    );
    if (discountUntil) {
        refuse(DISCOUNT_RUNNING, discountRunningMessage(discountUntil));
    }
    const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId } });
    return { kind: "schedule", from: state.settled, plan, startAt };
}

/**
 * When a coupon's discounted charges end: the end of the period its last
 * one pays for, over the business's live provider subscription and an
 * authorised change still to start. Charges taken are counted as the
 * invoices count them (an upgrade's difference and a nominal first month
 * aside). Null when none is left.
 */
async function discountRunsUntilInTx(
    tx: Tx,
    organizationId: string,
    sub: {
        status: string;
        provider: string | null;
        providerSubscriptionId: string | null;
        currentPeriodEnd: Date | null;
        billingCycle: string;
    } | null,
    scheduled: BillingCheckout | null,
): Promise<Date | null> {
    const runs: {
        provider: string;
        providerSubscriptionId: string;
        discountCharges: number;
        cycle: string;
        next: Date | null;
    }[] = [];
    if (
        sub?.provider &&
        sub.providerSubscriptionId &&
        sub.status !== "CANCELLED"
    ) {
        const live = await tx.billingCheckout.findUnique({
            where: {
                provider_providerSubscriptionId: {
                    provider: sub.provider,
                    providerSubscriptionId: sub.providerSubscriptionId,
                },
            },
            select: { discountCharges: true },
        });
        if (live) {
            runs.push({
                provider: sub.provider,
                providerSubscriptionId: sub.providerSubscriptionId,
                discountCharges: live.discountCharges,
                cycle: sub.billingCycle,
                next: sub.currentPeriodEnd,
            });
        }
    }
    if (scheduled) {
        runs.push({
            provider: scheduled.provider,
            providerSubscriptionId: scheduled.providerSubscriptionId,
            discountCharges: scheduled.discountCharges,
            cycle: scheduled.cycle,
            next: scheduled.startAt,
        });
    }
    let until: Date | null = null;
    for (const run of runs) {
        if (run.discountCharges <= 0 || !run.next) continue;
        const taken = await tx.sarohInvoice.count({
            where: {
                organizationId,
                provider: run.provider,
                providerSubscriptionId: run.providerSubscriptionId,
                source: { not: "UPGRADE" },
                NOT: { chargeKey: { startsWith: FIRST_MONTH_KEY } },
            },
        });
        const left = run.discountCharges - taken;
        if (left <= 0) continue;
        const cycle = run.cycle === "year" ? "year" : "month";
        let end = run.next;
        for (let i = 0; i < left; i += 1) end = periodEnd(end, cycle);
        if (!until || end.getTime() > until.getTime()) until = end;
    }
    return until;
}

/** A checkout no longer wanted, its provider subscription too. */
async function giveUpInTx(
    tx: Tx,
    checkout: BillingCheckout,
    reason: string,
): Promise<void> {
    await tx.billingCheckout.update({
        where: { id: checkout.id },
        data: { status: "CANCELLED", endedReason: reason },
    });
    await enqueueProviderCancel(tx, {
        organizationId: checkout.organizationId,
        provider: checkout.provider,
        providerSubscriptionId: checkout.providerSubscriptionId,
        atCycleEnd: false,
    });
}
