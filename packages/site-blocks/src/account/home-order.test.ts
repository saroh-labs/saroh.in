import { describe, expect, it } from "vitest";

import type {
    AccountChange,
    AccountInvoiceDue,
    AccountWaitlistPlace,
} from "./details-model";
import type { HomeBlock } from "./home-order";
import { homeLayout } from "./home-order";
import type {
    AccountBooking,
    AccountHome,
    AccountOrder,
    AccountPlan,
    AccountTab,
    Block,
} from "./model";

/**
 * Home's order (DEC-142): what the customer has in progress first, then
 * what is recent, then what else they can do — only for what the business
 * offers — and one welcome block when there is nothing at all. Every
 * combination of what a customer can have is walked, and held to the rules.
 */

const BOOKING: AccountBooking = {
    ref: "bk_1",
    service: "Check-up",
    startAt: "2026-10-15T04:30:00.000Z",
    endAt: "2026-10-15T05:00:00.000Z",
    timezone: "Asia/Kolkata",
    staff: null,
    online: null,
};

const order = (open: boolean): AccountOrder => ({
    ref: open ? "o_open" : "o_done",
    number: open ? "1019" : "1001",
    placedAt: "2026-10-02T00:00:00.000Z",
    total: "450.00",
    currency: "INR",
    open,
    status: open ? "Ready" : "Collected",
    fulfilment: "Pick-up",
    items: [{ name: "Sourdough", quantity: 1 }],
    moreItems: 0,
});

const PLAN: AccountPlan = {
    ref: "sub_1",
    name: "Unlimited",
    price: "2500.00",
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    renewsAt: "2026-10-18T00:00:00.000Z",
    pausedUntil: null,
    endsAt: null,
};

const INVOICE: AccountInvoiceDue = {
    ref: "inv_1",
    number: "INV-0042",
    what: "Unlimited, October",
    issuedAt: "2026-10-01T00:00:00.000Z",
    dueAt: "2026-10-08T00:00:00.000Z",
    overdue: true,
    total: "2500.00",
    currency: "INR",
    billOfSupply: false,
    pay: "online",
};

const place = (status: "WAITING" | "OFFERED"): AccountWaitlistPlace => ({
    service: "Morning flow",
    serviceRef: "svc_1",
    startAt: "2026-10-14T03:30:00.000Z",
    timezone: "Asia/Kolkata",
    status,
    placeInLine: status === "WAITING" ? 2 : null,
    offeredUntil: status === "OFFERED" ? "2026-10-12T07:00:00.000Z" : null,
});

const MESSAGE_CHANGE: AccountChange = {
    kind: "messages",
    count: 1,
    at: "2026-10-11T00:00:00.000Z",
};
const ORDER_CHANGE: AccountChange = {
    kind: "order",
    ref: "o_open",
    number: "1019",
    status: "Ready",
    at: "2026-10-11T00:00:00.000Z",
};

const ok = <T>(value: T): Block<T> => ({ ok: true, value });
const FAILED = { ok: false } as const;

const TABS: AccountTab[] = [
    { key: "home", label: "Home" },
    { key: "bookings", label: "Bookings" },
    { key: "orders", label: "Orders" },
    { key: "messages", label: "Messages" },
    { key: "me", label: "Your details" },
];

function home(over: Partial<AccountHome> = {}): AccountHome {
    return {
        nextBooking: ok(null),
        classes: ok(null),
        orders: ok([]),
        plan: ok(null),
        changes: ok([]),
        since: null,
        invoicesDue: ok([]),
        waitlist: ok([]),
        courses: ok([]),
        linkPending: false,
        ...over,
    };
}

const account = (unread = 0, tabs = TABS) => ({
    tabs,
    unreadMessages: unread,
});
const OPEN = { canBook: true, canShop: true };

const PROGRESS: HomeBlock[] = [
    "place-held",
    "to-pay",
    "booking",
    "orders",
    "messages",
];
const LAST: HomeBlock[] = ["offers", "welcome"];

describe("Home's order: the cases the audit named", () => {
    it("a shop's customer with one order sees the order first, and Book a time last", () => {
        // "Next booking: Nothing booked" used to sit above their one order.
        const layout = homeLayout(
            account(),
            home({ orders: ok([order(true)]) }),
            OPEN,
        );
        expect(layout.blocks).toEqual(["orders", "offers"]);
        // They have an order on its way, so the shop isn't pushed at them.
        expect(layout.offers).toEqual({ book: true, shop: false });
    });

    it("something that changed leads, then what is in progress, in a fixed order", () => {
        const layout = homeLayout(
            account(3),
            home({
                changes: ok([ORDER_CHANGE]),
                waitlist: ok([place("OFFERED"), place("WAITING")]),
                invoicesDue: ok([INVOICE]),
                nextBooking: ok(BOOKING),
                orders: ok([order(true)]),
                plan: ok(PLAN),
            }),
            OPEN,
        );
        expect(layout.blocks).toEqual([
            "changes",
            // A held place runs out within hours; money owed next.
            "place-held",
            "to-pay",
            "booking",
            "orders",
            "messages",
            // Then what they hold, then the line they wait in.
            "plan",
            "waiting",
        ]);
        // Nothing to offer: they have a booking and an order under way.
        expect(layout.offers).toEqual({ book: false, shop: false });
    });

    it("finished orders are recent, not in progress, and the shop is offered again", () => {
        const layout = homeLayout(
            account(),
            home({ orders: ok([order(false)]), nextBooking: null }),
            OPEN,
        );
        expect(layout.blocks).toEqual(["orders", "offers"]);
        // A business that takes no bookings is never offered a booking.
        expect(layout.offers).toEqual({ book: false, shop: true });
    });

    it("with nothing at all there is one welcome block, which carries the offers", () => {
        const layout = homeLayout(account(), home(), OPEN);
        expect(layout.blocks).toEqual(["welcome"]);
        expect(layout.offers).toEqual({ book: true, shop: true });
    });

    it("an unread message is in progress once, never twice", () => {
        // Said by "since you were last here": no second card for it.
        expect(
            homeLayout(
                account(1),
                home({ changes: ok([MESSAGE_CHANGE]) }),
                OPEN,
            ).blocks,
        ).toEqual(["changes", "offers"]);
        // Unread from before the last visit: its own card.
        expect(homeLayout(account(1), home(), OPEN).blocks).toEqual([
            "messages",
            "offers",
        ]);
    });

    it("a business with no Messages tab gets no message line and no message card", () => {
        const tabs = TABS.filter((t) => t.key !== "messages");
        const layout = homeLayout(
            account(2, tabs),
            home({ changes: ok([MESSAGE_CHANGE]) }),
            OPEN,
        );
        expect(layout.changes).toEqual([]);
        expect(layout.blocks).toEqual(["welcome"]);
    });

    it("a block whose read failed is still there, and never the reason for a welcome", () => {
        const layout = homeLayout(
            account(),
            home({
                nextBooking: FAILED,
                orders: FAILED,
                invoicesDue: FAILED,
                waitlist: FAILED,
                courses: FAILED,
                classes: FAILED,
                plan: FAILED,
                changes: FAILED,
            }),
            OPEN,
        );
        expect(layout.blocks).toEqual([
            "changes",
            "booking",
            "orders",
            "to-pay",
            "classes",
            "plan",
            "courses",
            "waiting",
            // Offered still: nothing says they have one under way.
            "offers",
        ]);
    });

    it("an API from before DEC-142 draws what it sent, and nothing for what it didn't", () => {
        const layout = homeLayout(
            account(),
            {
                nextBooking: ok(BOOKING),
                classes: ok(null),
                orders: null,
                plan: ok(PLAN),
            },
            { canBook: true, canShop: false },
        );
        expect(layout.blocks).toEqual(["booking", "plan"]);
    });
});

describe("Home's order: every combination", () => {
    const BOOKINGS: [string, AccountHome["nextBooking"]][] = [
        ["off", null],
        ["none", ok(null)],
        ["booked", ok(BOOKING)],
        ["failed", FAILED],
    ];
    const ORDERS: [string, AccountHome["orders"]][] = [
        ["off", null],
        ["none", ok([])],
        ["recent", ok([order(false)])],
        ["open", ok([order(false), order(true)])],
        ["failed", FAILED],
    ];
    const INVOICES: [string, AccountHome["invoicesDue"]][] = [
        ["absent", undefined],
        ["none", ok([])],
        ["due", ok([INVOICE])],
        ["failed", FAILED],
    ];
    const LINES: [string, AccountHome["waitlist"]][] = [
        ["off", null],
        ["none", ok([])],
        ["held", ok([place("OFFERED")])],
        ["waiting", ok([place("WAITING")])],
        ["both", ok([place("OFFERED"), place("WAITING")])],
        ["failed", FAILED],
    ];
    const PLANS: [string, AccountHome["plan"]][] = [
        ["none", ok(null)],
        ["has", ok(PLAN)],
    ];
    const CHANGES: [string, AccountHome["changes"]][] = [
        ["none", ok([])],
        ["some", ok([ORDER_CHANGE])],
    ];
    const DOORS = [
        { canBook: true, canShop: true },
        { canBook: true, canShop: false },
        { canBook: false, canShop: true },
        { canBook: false, canShop: false },
    ];

    function check(
        data: AccountHome,
        unread: number,
        doors: { canBook: boolean; canShop: boolean },
    ) {
        const { blocks, offers } = homeLayout(account(unread), data, doors);
        const at = (key: HomeBlock) => blocks.indexOf(key);
        const label = JSON.stringify({ data, unread, doors });

        // Each block once.
        if (new Set(blocks).size !== blocks.length) throw new Error(label);

        // What changed leads.
        if (at("changes") > 0) throw new Error(`changes not first: ${label}`);

        // Offers, or the welcome, come last, and never both.
        const last = blocks.filter((b) => LAST.includes(b));
        if (last.length > 1) throw new Error(`two endings: ${label}`);
        if (last.length === 1 && blocks.at(-1) !== last[0]) {
            throw new Error(`ending not last: ${label}`);
        }

        const booked = data.nextBooking?.ok === true && data.nextBooking.value;
        const orderOpen =
            data.orders?.ok === true && data.orders.value.some((o) => o.open);
        const held =
            data.waitlist?.ok === true &&
            data.waitlist.value.some((p) => p.status === "OFFERED");
        const due =
            data.invoicesDue?.ok === true && data.invoicesDue.value.length > 0;

        // Everything in progress is there, before everything recent.
        const inProgress: [HomeBlock, boolean][] = [
            ["place-held", held],
            ["to-pay", due],
            ["booking", Boolean(booked)],
            ["orders", orderOpen],
        ];
        const progressAt = inProgress
            .filter(([, on]) => on)
            .map(([key]) => {
                if (at(key) === -1) throw new Error(`${key} missing: ${label}`);
                return at(key);
            });
        const recentAt = blocks
            .map((b, i) => ({ b, i }))
            .filter(
                ({ b }) =>
                    b !== "changes" &&
                    !LAST.includes(b) &&
                    !(
                        PROGRESS.includes(b) &&
                        (inProgress.find(([k]) => k === b)?.[1] ??
                            b === "messages")
                    ),
            )
            .map(({ i }) => i);
        if (
            progressAt.length > 0 &&
            recentAt.length > 0 &&
            Math.max(...progressAt) > Math.min(...recentAt)
        ) {
            throw new Error(`recent before in progress: ${label}`);
        }

        // A read that failed never vanishes.
        const failed: [HomeBlock, { ok: boolean } | null | undefined][] = [
            ["booking", data.nextBooking],
            ["orders", data.orders],
            ["to-pay", data.invoicesDue],
            ["waiting", data.waitlist],
        ];
        for (const [key, block] of failed) {
            if (block && !block.ok && at(key) === -1) {
                throw new Error(`failed ${key} hidden: ${label}`);
            }
        }

        // Offers only for what the business offers, the site can serve,
        // and the customer has none of under way.
        const mayBook = doors.canBook && data.nextBooking !== null && !booked;
        const mayShop = doors.canShop && data.orders !== null && !orderOpen;
        if (offers.book !== mayBook || offers.shop !== mayShop) {
            throw new Error(`offers wrong: ${label}`);
        }

        // The welcome block only when there is nothing else to show.
        const others = blocks.filter((b) => !LAST.includes(b));
        if (blocks.includes("welcome") !== (others.length === 0)) {
            throw new Error(`welcome wrong: ${label}`);
        }
        // The offers card only when there is something to offer.
        if (blocks.includes("offers") && !offers.book && !offers.shop) {
            throw new Error(`empty offers card: ${label}`);
        }
        if (
            others.length > 0 &&
            (offers.book || offers.shop) &&
            !blocks.includes("offers")
        ) {
            throw new Error(`offers missing: ${label}`);
        }
    }

    it("holds for every combination of what a customer can have", () => {
        let walked = 0;
        for (const [, nextBooking] of BOOKINGS)
            for (const [, orders] of ORDERS)
                for (const [, invoicesDue] of INVOICES)
                    for (const [, waitlist] of LINES)
                        for (const [, plan] of PLANS)
                            for (const [, changes] of CHANGES)
                                for (const unread of [0, 2])
                                    for (const doors of DOORS) {
                                        walked += 1;
                                        check(
                                            home({
                                                nextBooking,
                                                orders,
                                                invoicesDue,
                                                waitlist,
                                                plan,
                                                changes,
                                            }),
                                            unread,
                                            doors,
                                        );
                                    }
        // 4 × 5 × 4 × 6 × 2 × 2 × 2 × 4, each held to every rule above.
        expect(walked).toBe(4 * 5 * 4 * 6 * 2 * 2 * 2 * 4);
    });
});
