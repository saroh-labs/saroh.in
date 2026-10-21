import type { Prisma } from "@saroh/database";

import { siteOriginOf } from "../sites/site-origin";
import { accountAreaOn } from "./account-area";
import type { NoticeKind } from "./notify-templates";

/**
 * The way back from a notice's email to what it is about, on the
 * business's own site: the order's page for an order just placed, the
 * booking's page for a booking made or moved, the booking page for a hold
 * that lapsed (#1137).
 *
 * - **The customer's own site.** The one they last signed in on (a business
 *   may have more than one), at its primary address: its verified custom
 *   domain when it has one, else its Saroh address (`siteOriginOf`).
 * - **Only a page that is there.** While the account area is on
 *   (`SITE_ACCOUNT_AREA`), both lead to the thing's own page in the account
 *   (`/account/orders/‹id›`, `/account/bookings/‹id›`, DEC-142), which asks
 *   a signed-out visitor to sign in and then stays on that page. Off, an
 *   order's email leads to the shop's order page, which shows a site order
 *   to whoever placed it, and a booking's email carries no link rather
 *   than one that opens a "not found".
 * - **Never a secret.** The address names the order by its id and nothing
 *   else: opening it shows nothing to anyone but its signed-in customer.
 *
 * Null when there is no published site, or nothing to link to. Never
 * throws: a notice goes without its link rather than not at all.
 */

type Db = Pick<Prisma.TransactionClient, "customerSession" | "site" | "domain">;

export async function noticeLink(
    db: Db,
    organizationId: string,
    subject: {
        kind: NoticeKind;
        contactId: string;
        orderId?: string;
        bookingId?: string;
        serviceId?: string;
    },
): Promise<string | null> {
    const path = pathOf(subject);
    if (!path) return null;
    try {
        const origin = await contactSiteOrigin(
            db,
            organizationId,
            subject.contactId,
        );
        return origin ? `${origin}${path}` : null;
    } catch {
        return null;
    }
}

/**
 * The business's site a contact's emails lead back to: the one they last
 * signed in on, else its first published one, at its primary address
 * (`siteOriginOf`). Null when there is no published site. Shared by every
 * notice's link (the waitlist offer's claim link too, `waitlist-claim.ts`).
 */
export async function contactSiteOrigin(
    db: Db,
    organizationId: string,
    contactId: string,
): Promise<string | null> {
    const session = await db.customerSession.findFirst({
        where: { organizationId, account: { contactId } },
        orderBy: { createdAt: "desc" },
        select: { siteId: true },
    });
    return (
        (session
            ? await siteOriginOf(organizationId, { siteId: session.siteId }, db)
            : null) ?? (await siteOriginOf(organizationId, {}, db))
    );
}

/** The page a notice leads back to; null for a notice with none. */
export function pathOf(subject: {
    kind: NoticeKind;
    orderId?: string;
    bookingId?: string;
    serviceId?: string;
}): string | null {
    if (subject.kind === "ORDER_PLACED" && subject.orderId) {
        const order = encodeURIComponent(subject.orderId);
        // The order's own page in the account (DEC-142) while the area is
        // on; off, the shop's order page, which is always there.
        return accountAreaOn()
            ? `/account/orders/${order}`
            : `/shop/order/${order}`;
    }
    if (
        (subject.kind === "BOOKING_CONFIRMED" ||
            subject.kind === "BOOKING_MOVED") &&
        subject.bookingId &&
        accountAreaOn()
    ) {
        // The booking's own page (DEC-142), so the email opens the thing.
        return `/account/bookings/${encodeURIComponent(subject.bookingId)}`;
    }
    if (subject.kind === "BOOKING_LAPSED" && subject.serviceId) {
        // A lapsed hold (#1137): the booking page, on the service, to book
        // again. It served the hold minutes ago, so it is there.
        return `/book?service=${encodeURIComponent(subject.serviceId)}`;
    }
    return null;
}
