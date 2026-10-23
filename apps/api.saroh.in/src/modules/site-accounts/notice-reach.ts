import type { Prisma } from "@saroh/database";

import { accountThreadOn } from "../communications/account-thread";
import { contactNoticeAddress } from "../communications/contact-address";
import { emailRoute } from "../communications/email-route";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { accountAreaOn } from "./account-area";

/**
 * Who hears about a customer's own booking or order, and how (round-2 A14,
 * R15, R17). One rule, read by the notify handler to decide what to write
 * and by the workspace to say it truthfully ("Saroh doesn't message them"
 * only where nothing is sent):
 *
 * - **The account thread** is written when it is live: the account area is
 *   on (`SITE_ACCOUNT_AREA`), the business's `ACCOUNT_THREAD` rollout flag
 *   is on (both off by default), and the business has not turned its
 *   updates off (`BusinessProfile.accountUpdates`, on by default). The rule
 *   is `accountThreadOn`. A customer with a live site account sees it
 *   there; one without sees it when they first sign in.
 * - **Email** goes to the contact's own email (DEC-174 D1, U2 #1133): a
 *   desk, phone or guest customer as much as one with a site account,
 *   whose verified address wins when it differs (A2,
 *   `contactNoticeAddress`). Only through the business's own connected
 *   EMAIL provider (D17, default 10; `emailRoute`), and never to one who
 *   turned email off. Saroh never emails a business's customers itself
 *   (DEC-086 reversed, its code removed in #1134).
 *   Nothing goes by SMS or WhatsApp this round.
 */

/** What the business can use at all. */
export interface NoticeChannels {
    /** A notice is emailed: the business's own EMAIL provider is connected. */
    email: boolean;
    /** The account thread is live for it. */
    thread: boolean;
}

/**
 * - `EMAIL_AND_ACCOUNT`: emailed, and it shows in their account.
 * - `EMAIL`: emailed; no account thread for them (it isn't live, or they
 *   have no account yet and see it there only if they sign in).
 * - `ACCOUNT`: shown in their account on the site; no email.
 * - `ON_SIGN_IN`: no account yet; they see it when they sign in.
 * - `NONE`: nothing is sent.
 */
export type NoticeReach =
    "EMAIL_AND_ACCOUNT" | "EMAIL" | "ACCOUNT" | "ON_SIGN_IN" | "NONE";

type Db = Pick<
    Prisma.TransactionClient,
    | "communicationProvider"
    | "customerAccount"
    | "contact"
    | "consent"
    | "$queryRaw"
>;

/**
 * Whether Saroh posts to the business's account threads: the one rule
 * (`accountThreadOn`: the account area, the rollout flag and the business's
 * own choice). The area is asked here first only to save the reads while
 * it is off; the rule asks it again.
 */
export async function threadLive(organizationId: string): Promise<boolean> {
    return accountAreaOn() ? accountThreadOn(organizationId) : false;
}

export async function noticeChannels(
    db: Pick<Prisma.TransactionClient, "communicationProvider">,
    organizationId: string,
): Promise<NoticeChannels> {
    const [provider, thread] = await Promise.all([
        emailRoute(db, organizationId),
        threadLive(organizationId),
    ]);
    return { email: provider !== null, thread };
}

/**
 * The rule itself, from what reaches this contact: `email` is whether an
 * email goes to them (a provider, an address, consent), `thread` whether
 * the thread is live, and whether they have a live account.
 */
export function reachOf(
    channels: NoticeChannels,
    hasAccount: boolean,
): NoticeReach {
    if (channels.email) {
        return channels.thread && hasAccount ? "EMAIL_AND_ACCOUNT" : "EMAIL";
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

/** How a notice reaches a contact, and the address an email goes to. */
export interface ContactNotice {
    reach: NoticeReach;
    /** Where it is emailed ("Emailed to ‹email›"); null when it isn't. */
    to: string | null;
}

/**
 * How a notice would reach this contact now, and where it is emailed. A
 * merged-away contact is read as its survivor; a removed one, or none,
 * hears nothing. One with no email address, or who revoked email consent
 * (the send is SUPPRESSED, D17), is not emailed, so is never said to be.
 */
export async function contactNotice(
    db: Db,
    organizationId: string,
    contactId: string | null,
    channels?: NoticeChannels,
): Promise<ContactNotice> {
    if (!contactId) return { reach: "NONE", to: null };
    const contact = await resolveContact(db, contactId, organizationId);
    if (!contact || contact.removed) return { reach: "NONE", to: null };
    const [can, account, consent, address] = await Promise.all([
        channels ?? noticeChannels(db, organizationId),
        hasLiveAccount(db, organizationId, contact.id),
        db.consent.findUnique({
            where: {
                contactId_channel: { contactId: contact.id, channel: "EMAIL" },
            },
            select: { status: true },
        }),
        contactNoticeAddress(db, organizationId, contact.id),
    ]);
    const emailed =
        can.email && address !== null && consent?.status !== "REVOKED";
    return {
        reach: reachOf({ ...can, email: emailed }, account),
        to: emailed ? address : null,
    };
}

/** {@link contactNotice}'s reach alone. */
export async function contactReach(
    db: Db,
    organizationId: string,
    contactId: string | null,
    channels?: NoticeChannels,
): Promise<NoticeReach> {
    return (await contactNotice(db, organizationId, contactId, channels)).reach;
}
