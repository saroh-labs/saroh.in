import type { Prisma } from "@saroh/database";

import { planMeter } from "../billing/metering.service";
import { accountThreadOn } from "./account-thread";

type Db = Pick<Prisma.TransactionClient, "communicationProvider">;

/**
 * Whether a business can email its customers (DEC-011, amended
 * 2026-10-07): only through its own connected email provider, so with none
 * its customers get no emails. Those with an account on its site see their
 * booking and order updates there only while Saroh posts to the account
 * threads (`accountThreadOn`); otherwise they hear nothing (U5, #1136).
 *
 * `canConnect`, when it has none: whether its plan lets it connect one now
 * — the connect's own check, `MeteringService.hasRoom` on `integrations`
 * (false on Free, DEC-091). Null when it has one, or when the plan couldn't
 * be read: never claimed either way.
 */
export interface EmailSetup {
    connected: boolean;
    canConnect: boolean | null;
    /**
     * When it has none: whether its customers with an account on its site
     * see their updates there (`accountThreadOn`). Null when it has one, or
     * when that couldn't be read: the words then claim neither.
     */
    accountUpdates: boolean | null;
}

/** The plan's room for one more connection, as the connect asks it. */
export type ConnectRoom = (organizationId: string) => Promise<boolean>;

const integrationsRoom: ConnectRoom = (organizationId) =>
    planMeter.hasRoom(organizationId, "integrations");

/** Whether Saroh posts the business's updates to its customers' accounts. */
export type AccountUpdatesOn = (organizationId: string) => Promise<boolean>;

export async function readEmailSetup(
    db: Db,
    organizationId: string,
    room: ConnectRoom = integrationsRoom,
    thread: AccountUpdatesOn = accountThreadOn,
): Promise<EmailSetup> {
    const row = await db.communicationProvider.findUnique({
        where: { organizationId_channel: { organizationId, channel: "EMAIL" } },
        select: { status: true },
    });
    if (row?.status === "CONNECTED") {
        return { connected: true, canConnect: null, accountUpdates: null };
    }
    const [canConnect, accountUpdates] = await Promise.all([
        room(organizationId).catch(() => null),
        thread(organizationId).catch(() => null),
    ]);
    return { connected: false, canConnect, accountUpdates };
}

/** Who may act on a missing email provider: connect it, or change plans. */
export interface EmailSetupMay {
    /** `comms:manage`: may connect a provider. */
    connect: boolean;
    /** `billing:read`: may see the plans. */
    plans: boolean;
}

/**
 * What the business is asked to do about its email, for this person: null
 * when it has a provider, or when they can't do the thing that would fix
 * it — connect one (`comms:manage`), or, where the plan can't (DEC-091),
 * see the plans (`billing:read`). Unknown room asks to connect, as the
 * connect itself goes ahead when the plan can't be read.
 */
export function emailSetupAsk(
    setup: EmailSetup,
    may: EmailSetupMay,
): "connect" | "plans" | null {
    if (setup.connected) return null;
    if (setup.canConnect === false) return may.plans ? "plans" : null;
    return may.connect ? "connect" : null;
}

/**
 * The words, here and in the workspace's prompt
 * (`apps/app.saroh.in/lib/communications/email-setup.ts`), which keeps the
 * same sentences: what the customers miss, plainly, and what fixes it.
 */
export const EMAIL_SETUP_TITLE = "Your customers get no emails from you";
const NOT_EMAILED =
    "No email provider is connected, so invoices, booking and order updates and review invitations aren't emailed";

/**
 * What the customers miss, true for this business (U5, #1136): where Saroh
 * posts to their accounts, those with one see booking and order updates
 * there; where it doesn't, nobody hears. Unknown says only what isn't
 * emailed.
 */
export function emailSetupMissed(accountUpdates: boolean | null): string {
    if (accountUpdates === true) {
        return `${NOT_EMAILED}. Customers with an account on your site see booking and order updates there.`;
    }
    if (accountUpdates === false) {
        return `${NOT_EMAILED}, and your customers don't hear about them.`;
    }
    return `${NOT_EMAILED}.`;
}
export const EMAIL_SETUP_PLAN =
    "Connecting your own email comes with a paid plan.";
