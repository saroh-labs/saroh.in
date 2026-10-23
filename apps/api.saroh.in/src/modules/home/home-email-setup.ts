import type { Prisma } from "@saroh/database";

import type {
    AccountUpdatesOn,
    ConnectRoom,
    EmailSetupMay,
} from "../communications/email-setup";
import {
    EMAIL_SETUP_PLAN,
    EMAIL_SETUP_TITLE,
    emailSetupAsk,
    emailSetupMissed,
    readEmailSetup,
} from "../communications/email-setup";
import type { HomeAction } from "./home-model";

type Db = Pick<Prisma.TransactionClient, "communicationProvider">;

/** Connect the business's own email: its customers get none without it. */
export const NO_EMAIL_CODE = "COMMUNICATIONS_NO_EMAIL";
/** The same, on a plan that can't connect one (DEC-091): see the plans. */
export const NO_EMAIL_PLAN_CODE = "COMMUNICATIONS_NO_EMAIL_PLAN";

/** The rows' lines, carried on the action as `sub` (true per business, U5). */
export function noEmailSub(
    accountUpdates: boolean | null,
    plan: boolean,
): string {
    const missed = emailSetupMissed(accountUpdates);
    return plan ? `${missed} ${EMAIL_SETUP_PLAN}` : missed;
}

/**
 * A business with no email provider of its own (DEC-011, amended
 * 2026-10-07): its customers get no emails — invoices, booking and order
 * updates, review invitations — and see their updates in their account
 * only where Saroh posts there (`emailSetupMissed`). Home's Needs you says so to whoever can fix it: Connect, for
 * `comms:manage`; on a plan that can't connect one (Free, DEC-091), See
 * plans, for `billing:read`. Gone once one is connected.
 *
 * The caller asks only while Communications is on (off, nothing is sent),
 * and only of someone who holds one of the two.
 */
export async function noEmailProvider(
    db: Db,
    organizationId: string,
    may: EmailSetupMay,
    room?: ConnectRoom,
    thread?: AccountUpdatesOn,
): Promise<HomeAction | null> {
    const setup = await readEmailSetup(db, organizationId, room, thread);
    const ask = emailSetupAsk(setup, may);
    if (ask === null) return null;
    if (ask === "plans") {
        return {
            code: NO_EMAIL_PLAN_CODE,
            title: EMAIL_SETUP_TITLE,
            sub: noEmailSub(setup.accountUpdates, true),
            href: "/settings/billing/plans",
            severity: "SETUP",
            moduleKey: "COMMUNICATIONS",
            tag: "Paid plans",
            tone: "info",
        };
    }
    return {
        code: NO_EMAIL_CODE,
        title: EMAIL_SETUP_TITLE,
        sub: noEmailSub(setup.accountUpdates, false),
        href: "/settings/providers",
        severity: "ATTENTION",
        moduleKey: "COMMUNICATIONS",
        tag: "To connect",
        tone: "due",
    };
}
