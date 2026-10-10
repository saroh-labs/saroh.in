import type { Prisma } from "@saroh/database";

import { siteOriginOf } from "../sites/site-origin";
import { accountAreaOn } from "./account-area";
import type { NoticeKind } from "./notify-templates";

/**
 * The way back from a notice's email to what it is about, on the
 * business's own site: the order's page for an order just placed, the
 * customer's bookings for a booking made or moved.
 *
 * - **The customer's own site.** The one they last signed in on (a business
 *   may have more than one), at its primary address: its verified custom
 *   domain when it has one, else its Saroh address (`siteOriginOf`).
 * - **Only a page that is there.** The order's page shows a site order to
 *   whoever placed it, signed in, and asks a signed-out visitor to sign in.
 *   The bookings page exists only while the account area is on
 *   (`SITE_ACCOUNT_AREA`): off, a booking's email carries no link rather
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
    },
): Promise<string | null> {
    const path = pathOf(subject);
    if (!path) return null;
    try {
        const session = await db.customerSession.findFirst({
            where: {
                organizationId,
                account: { contactId: subject.contactId },
            },
            orderBy: { createdAt: "desc" },
            select: { siteId: true },
        });
        const origin =
            (session
                ? await siteOriginOf(
                      organizationId,
                      { siteId: session.siteId },
                      db,
                  )
                : null) ?? (await siteOriginOf(organizationId, {}, db));
        return origin ? `${origin}${path}` : null;
    } catch {
        return null;
    }
}

/** The page a notice leads back to; null for a notice with none. */
export function pathOf(subject: {
    kind: NoticeKind;
    orderId?: string;
    bookingId?: string;
}): string | null {
    if (subject.kind === "ORDER_PLACED" && subject.orderId) {
        return `/shop/order/${encodeURIComponent(subject.orderId)}`;
    }
    if (
        (subject.kind === "BOOKING_CONFIRMED" ||
            subject.kind === "BOOKING_MOVED") &&
        subject.bookingId &&
        accountAreaOn()
    ) {
        return "/account/bookings";
    }
    return null;
}
