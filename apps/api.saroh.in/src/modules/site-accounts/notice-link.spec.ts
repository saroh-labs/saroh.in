/**
 * The way back from a notice's email (`notice-link.ts`): which page, on
 * which of the business's addresses. The database is a hand-made fake;
 * every id and host is made up.
 */
jest.mock("./account-area", () => ({ accountAreaOn: jest.fn(() => true) }));

import { accountAreaOn } from "./account-area";
import { withLink } from "./customer-notify.handler";
import { noticeLink, pathOf } from "./notice-link";
import type { NoticeVars } from "./notify-templates";

const areaOn = accountAreaOn as jest.Mock;

function db(
    over: {
        session?: { siteId: string } | null;
        sites?: Record<string, { id: string; subdomain: string | null }>;
        domain?: { hostname: string } | null;
    } = {},
) {
    const sites = over.sites ?? {
        site_a: { id: "site_a", subdomain: "rye" },
        site_b: { id: "site_b", subdomain: "rye-cakes" },
    };
    return {
        customerSession: {
            findFirst: jest.fn().mockResolvedValue(over.session ?? null),
        },
        site: {
            findFirst: jest.fn(({ where }: { where: { id?: string } }) =>
                Promise.resolve(
                    where.id
                        ? (sites[where.id] ?? null)
                        : (Object.values(sites)[0] ?? null),
                ),
            ),
        },
        domain: { findFirst: jest.fn().mockResolvedValue(over.domain ?? null) },
    };
}

beforeEach(() => areaOn.mockReturnValue(true));

describe("the page a notice leads back to", () => {
    it("is the order's own page in the account for an order placed, and the shop's while the area is off", () => {
        expect(pathOf({ kind: "ORDER_PLACED", orderId: "ord_1" })).toBe(
            "/account/orders/ord_1",
        );
        expect(pathOf({ kind: "ORDER_PLACED" })).toBeNull();
        areaOn.mockReturnValue(false);
        // Never a link to a page that isn't there.
        expect(pathOf({ kind: "ORDER_PLACED", orderId: "ord_1" })).toBe(
            "/shop/order/ord_1",
        );
    });

    it("is the booking's own page for a booking made or moved, only while the account area is on", () => {
        expect(pathOf({ kind: "BOOKING_CONFIRMED", bookingId: "b_1" })).toBe(
            "/account/bookings/b_1",
        );
        expect(pathOf({ kind: "BOOKING_MOVED", bookingId: "b_1" })).toBe(
            "/account/bookings/b_1",
        );
        areaOn.mockReturnValue(false);
        expect(
            pathOf({ kind: "BOOKING_CONFIRMED", bookingId: "b_1" }),
        ).toBeNull();
    });

    it("names the thing by its id alone, escaped", () => {
        expect(pathOf({ kind: "ORDER_PLACED", orderId: "a/b?c" })).toBe(
            "/account/orders/a%2Fb%3Fc",
        );
        expect(pathOf({ kind: "BOOKING_MOVED", bookingId: "a b" })).toBe(
            "/account/bookings/a%20b",
        );
    });

    it("is nothing for a notice with nowhere to go", () => {
        for (const kind of [
            "BOOKING_CANCELLED",
            "ORDER_READY",
            "ORDER_HANDED_OVER",
            "WAITLIST_OFFER",
        ] as const) {
            expect(pathOf({ kind, orderId: "o", bookingId: "b" })).toBeNull();
        }
    });
});

describe("the address it is on", () => {
    const order = {
        kind: "ORDER_PLACED" as const,
        contactId: "c_1",
        orderId: "ord_1",
    };

    it("is the site the customer last signed in on, at its Saroh address", async () => {
        const fake = db({ session: { siteId: "site_b" } });
        await expect(noticeLink(fake as never, "org_1", order)).resolves.toBe(
            "https://rye-cakes.saroh.app/account/orders/ord_1",
        );
        expect(fake.customerSession.findFirst.mock.calls[0][0]).toMatchObject({
            where: { organizationId: "org_1", account: { contactId: "c_1" } },
            orderBy: { createdAt: "desc" },
        });
    });

    it("is its verified custom domain when it has one", async () => {
        const fake = db({
            session: { siteId: "site_a" },
            domain: { hostname: "ryeandco.example" },
        });
        await expect(noticeLink(fake as never, "org_1", order)).resolves.toBe(
            "https://ryeandco.example/account/orders/ord_1",
        );
    });

    it("falls back to the business's first published site, and to no link with none", async () => {
        await expect(noticeLink(db() as never, "org_1", order)).resolves.toBe(
            "https://rye.saroh.app/account/orders/ord_1",
        );
        await expect(
            noticeLink(db({ sites: {} }) as never, "org_1", order),
        ).resolves.toBeNull();
    });

    it("never throws: a read that fails sends the notice without its link", async () => {
        const fake = db();
        fake.customerSession.findFirst.mockRejectedValue(new Error("down"));
        await expect(
            noticeLink(fake as never, "org_1", order),
        ).resolves.toBeNull();
    });

    it("reads nothing for a notice with no page", async () => {
        const fake = db();
        await expect(
            noticeLink(fake as never, "org_1", {
                kind: "ORDER_READY",
                contactId: "c_1",
                orderId: "ord_1",
            }),
        ).resolves.toBeNull();
        expect(fake.customerSession.findFirst).not.toHaveBeenCalled();
    });
});

describe("putting the link on a notice", () => {
    const placed: NoticeVars = {
        kind: "ORDER_PLACED",
        placed: {
            business: "Rye & Co.",
            firstName: "Asha",
            number: "ORD-1019",
            fulfilment: "PICKUP",
            payOnHandover: false,
        },
    };

    it("adds it to an order placed, and leaves the notice alone with none", () => {
        expect(withLink(placed, null)).toBe(placed);
        expect(
            withLink(placed, "https://rye.saroh.app/shop/order/o"),
        ).toMatchObject({
            placed: { link: "https://rye.saroh.app/shop/order/o" },
        });
    });
});
