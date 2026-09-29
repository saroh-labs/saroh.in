import type { Prisma } from "@saroh/database";

import { accountThreadOn } from "../communications/account-thread";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { accountAreaOn } from "./account-area";

/**
 * Who hears about a customer's own booking or order, and how (round-2 A14,
 * R15, R17). One rule, read by the notify handler to decide what to write
 * and by the workspace to say it truthfully ("Saroh doesn't message them"
 * only where nothing is sent):
 *
 * - **The account thread** is written when it is live: the account area is
 *   on (`SITE_ACCOUNT_AREA`) and the business's `ACCOUNT_THREAD` rollout
 *   flag is on (both off by default). A customer with a live site account
 *   sees it there; one without sees it when they first sign in.
 * - **Email** goes only to a live site account's verified email, and only
 *   through the business's own connected EMAIL provider (D17, default 10).
 *   Nothing goes by SMS or WhatsApp this round.
 */

/** What the business can use at all. */
export interface NoticeChannels {
    /** Its own EMAIL provider is connected. */
    email: boolean;
    /** The account thread is live for it. */
    thread: boolean;
}

/**
 * - `EMAIL_AND_ACCOUNT`: emailed, and it shows in their account.
 * - `EMAIL`: emailed (the thread isn't live).
 * - `ACCOUNT`: shown in their account on the site; no email.
 * - `ON_SIGN_IN`: no account yet; they see it when they sign in.
 * - `NONE`: nothing is sent.
 */
export type NoticeReach =
    "EMAIL_AND_ACCOUNT" | "EMAIL" | "ACCOUNT" | "ON_SIGN_IN" | "NONE";

type Db = Pick<
    Prisma.TransactionClient,
    "communicationProvider" | "customerAccount" | "consent" | "$queryRaw"
>;

export async function noticeChannels(
    db: Pick<Prisma.TransactionClient, "communicationProvider">,
    organizationId: string,
): Promise<NoticeChannels> {
    const [provider, thread] = await Promise.all([
        db.communicationProvider.findUnique({
            where: {
                organizationId_channel: { organizationId, channel: "EMAIL" },
            },
            select: { status: true },
        }),
        accountAreaOn() ? accountThreadOn(organizationId) : false,
    ]);
    return { email: provider?.status === "CONNECTED", thread };
}

/** The rule itself, from what the business can use and the contact has. */
export function reachOf(
    channels: NoticeChannels,
    hasAccount: boolean,
): NoticeReach {
    if (hasAccount && channels.email) {
        return channels.thread ? "EMAIL_AND_ACCOUNT" : "EMAIL";
    }
    if (channels.thread) return hasAccount ? "ACCOUNT" : "ON_SIGN_IN";
    return "NONE";
}

/** Whether the contact has a live site account. */
export async function hasLiveAccount(
    db: Pick<Prisma.TransactionClient, "customerAccount">,
    organizationId: string,
    contactId: string,
): Promise<boolean> {
    const count = await db.customerAccount.count({
        where: { organizationId, contactId, status: "ACTIVE" },
    });
    return count > 0;
}

/**
 * How a notice would reach this contact now. A merged-away contact is read
 * as its survivor; a removed one, or none, hears nothing. One who revoked
 * email consent is not emailed (the send is SUPPRESSED, D17), so is never
 * said to be.
 */
export async function contactReach(
    db: Db,
    organizationId: string,
    contactId: string | null,
    channels?: NoticeChannels,
): Promise<NoticeReach> {
    if (!contactId) return "NONE";
    const contact = await resolveContact(db, contactId, organizationId);
    if (!contact || contact.removed) return "NONE";
    const [can, account, consent] = await Promise.all([
        channels ?? noticeChannels(db, organizationId),
        hasLiveAccount(db, organizationId, contact.id),
        db.consent.findUnique({
            where: {
                contactId_channel: { contactId: contact.id, channel: "EMAIL" },
            },
            select: { status: true },
        }),
    ]);
    return reachOf(
        { ...can, email: can.email && consent?.status !== "REVOKED" },
        account,
    );
}
