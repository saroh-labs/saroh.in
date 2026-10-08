import type { Prisma } from "@saroh/database";

import type { ConnectRoom, EmailSetupMay } from "../communications/email-setup";
import {
    EMAIL_SETUP_MISSED,
    EMAIL_SETUP_PLAN,
    EMAIL_SETUP_TITLE,
    emailSetupAsk,
    readEmailSetup,
} from "../communications/email-setup";
import type { HomeAction } from "./home-model";

type Db = Pick<Prisma.TransactionClient, "communicationProvider">;

/** Connect the business's own email: its customers get none without it. */
export const NO_EMAIL_CODE = "COMMUNICATIONS_NO_EMAIL";
/** The same, on a plan that can't connect one (DEC-091): see the plans. */
export const NO_EMAIL_PLAN_CODE = "COMMUNICATIONS_NO_EMAIL_PLAN";

/** The rows' lines, for `home-needs.ts`. */
export const NO_EMAIL_SUB = EMAIL_SETUP_MISSED;
export const NO_EMAIL_PLAN_SUB = `${EMAIL_SETUP_MISSED} ${EMAIL_SETUP_PLAN}`;

/**
 * A business with no email provider of its own (DEC-011, amended
 * 2026-10-07): its customers get no emails — invoices, booking and order
 * updates, review invitations — and see their updates only in their
 * account. Home's Needs you says so to whoever can fix it: Connect, for
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
): Promise<HomeAction | null> {
    const setup = await readEmailSetup(db, organizationId, room);
    const ask = emailSetupAsk(setup, may);
    if (ask === null) return null;
    if (ask === "plans") {
        return {
            code: NO_EMAIL_PLAN_CODE,
            title: EMAIL_SETUP_TITLE,
            href: "/settings/billing#change-plan",
            severity: "SETUP",
            moduleKey: "COMMUNICATIONS",
            tag: "Paid plans",
            tone: "info",
        };
    }
    return {
        code: NO_EMAIL_CODE,
        title: EMAIL_SETUP_TITLE,
        href: "/settings/providers",
        severity: "ATTENTION",
        moduleKey: "COMMUNICATIONS",
        tag: "To connect",
        tone: "due",
    };
}
