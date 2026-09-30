import type { Db } from "./helpers";
import { DAY_MS, id } from "./helpers";

/**
 * Northwind's address before it was `northwind` (DEC-069, plan L3).
 *
 * After a change of web address the old one forwards to the site for 90
 * days and is held for the business (`AddressReservation`). This row is
 * such an address, as a change the day the seed ran would have left it, so
 * `northwind-before.saroh.app` answers a 307 to the same page on Northwind's
 * site, and Settings › Business shows where it forwards and until when.
 *
 * The browser spec reads the forwarding here (`web-address-change.spec.ts`)
 * rather than by changing an address itself: a business a test sets up
 * can't have a website (its module rollout flags are the production
 * default, off), and Northwind's own address is read by every other spec.
 * The change that writes such a row is covered against a real database in
 * `web-address.service.db.spec.ts`.
 *
 * Dated from `now` on every run, so a database seeded long ago forwards
 * again once it is seeded afresh.
 */
export const NORTHWIND_PREVIOUS_ADDRESS = "northwind-before";

const FORWARDS_FOR_DAYS = 90;

export async function seedPreviousAddress(
    prisma: Db,
    orgId: string,
    siteId: string | undefined,
    now: Date,
): Promise<void> {
    if (!siteId) return;
    const until = new Date(now.getTime() + FORWARDS_FOR_DAYS * DAY_MS);
    const row = {
        organizationId: orgId,
        siteId,
        redirectUntil: until,
        reservedUntil: until,
    };
    await prisma.addressReservation.upsert({
        where: { address: NORTHWIND_PREVIOUS_ADDRESS },
        update: row,
        create: {
            id: id("addressreservation", "northwind"),
            address: NORTHWIND_PREVIOUS_ADDRESS,
            ...row,
        },
    });
}
