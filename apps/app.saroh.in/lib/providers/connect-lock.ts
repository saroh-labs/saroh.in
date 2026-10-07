import type { BillingAccessView } from "@/lib/billing/access";
import {
    accessRow,
    ownAccountsRoom,
    takesOnlinePayment,
    upgradeHref,
} from "@/lib/billing/access";
import type { EmailSetup } from "@/lib/communications/email-setup";
import { SEE_PLANS_HREF } from "@/lib/communications/email-setup";

/**
 * What a provider row offers in place of Connect when the plan won't let
 * the business connect it (DEC-091, UX-006): the plan that has it and See
 * plans, said before any key form opens, never after the keys are typed.
 *
 * - Payments: the plan takes no online payment (row `payments`), or has no
 *   room for one more of the business's own accounts (`integrations`),
 *   read from the plan the screen already has, the way the connect's own
 *   check reads it (`ownAccountsRoom`, `takesOnlinePayment`).
 * - Email and WhatsApp: the API's own answer, `GET …/comms-providers/
 *   email-setup` (`canConnect: false`, `lib/communications/email-setup.ts`),
 *   the same state the email prompt and Settings' nudges read — never a
 *   second check of the plan. The plan only names what has it.
 *
 * Unread, legacy or unenforced is no lock, failing open — the connect still
 * refuses if it must. Plan names are the catalogue's; no price.
 */
export interface ConnectLock {
    /** "Comes with Grow", or why there's no room on this plan. */
    comesWith: string;
    cta: string;
    href: string;
    /** The plan that has it, by the catalogue's name; null when unnamed. */
    upgrade: string | null;
    /** The plan has the row, but every connection it allows is in use. */
    full: boolean;
}

export interface ConnectLocks {
    payments: ConnectLock | null;
    messaging: ConnectLock | null;
}

const NONE: ConnectLocks = { payments: null, messaging: null };

function lockFor(
    access: BillingAccessView,
    moduleId: "payments" | "integrations",
): ConnectLock {
    const row = accessRow(access, moduleId);
    const up = row?.upgradeTo ?? null;
    // On, but every connection the plan has is in use.
    const full = row?.state === "on";
    return {
        comesWith: full
            ? "Your plan's connections are all in use"
            : up
              ? `Comes with ${up.name}`
              : "Comes with a paid plan",
        cta: up ? `See ${up.name}` : "See plans",
        href: upgradeHref(up?.planId),
        upgrade: up?.name ?? null,
        full,
    };
}

/**
 * The business's own email (and WhatsApp) held back by the plan, as the
 * email setup says (`canConnect: false`); named from the plan when it was
 * read, else "a paid plan" and See plans, the prompt's own link.
 */
export function messagingLockOf(
    setup: EmailSetup | null | undefined,
    access: BillingAccessView | null = null,
): ConnectLock | null {
    if (setup?.connected !== false || setup.canConnect !== false) return null;
    if (access) return lockFor(access, "integrations");
    return {
        comesWith: "Comes with a paid plan",
        cta: "See plans",
        href: SEE_PLANS_HREF,
        upgrade: null,
        full: false,
    };
}

export function connectLocksOf(
    access: BillingAccessView | null,
    emailSetup: EmailSetup | null | undefined,
): ConnectLocks {
    const messaging = messagingLockOf(emailSetup, access);
    if (!access) return { ...NONE, messaging };
    const payments = !takesOnlinePayment(access)
        ? lockFor(access, "payments")
        : ownAccountsRoom(access)
          ? null
          : lockFor(access, "integrations");
    return { payments, messaging };
}

/**
 * The Turn on sheet's line for a module whose provider the plan won't let
 * the business connect (UX-006), said in place of "Connect now / Later".
 * Payments on such a plan is the offline kind: How to pay us is how
 * customers pay.
 */
export function connectLockLine(moduleKey: string, lock: ConnectLock): string {
    if (lock.full) {
        return "Every connection your plan allows is in use, so nothing new can be connected now.";
    }
    const plan = lock.upgrade ?? "a paid plan";
    return moduleKey === "PAYMENTS"
        ? `Taking payment online comes with ${plan}. Until then, customers pay you the ways you set in How to pay us.`
        : `Connecting your own email comes with ${plan}.`;
}

/** The lock a Turn on module's connect choice meets, if any. */
export function connectLockFor(
    moduleKey: string,
    locks: ConnectLocks | null,
): ConnectLock | null {
    if (!locks) return null;
    if (moduleKey === "PAYMENTS") return locks.payments;
    if (moduleKey === "COMMUNICATIONS") return locks.messaging;
    return null;
}
