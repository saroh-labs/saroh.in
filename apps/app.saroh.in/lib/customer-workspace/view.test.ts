import { describe, expect, it } from "vitest";

import { ADDED_BY_HAND, addedByHand } from "./added";
import type {
    CustomerDetail,
    DetailBooking,
    DetailInvoice,
    DetailOrder,
    DetailPack,
} from "./detail";
import {
    allowanceChangeLine,
    bookingLists,
    bookingRow,
    canStopOffers,
    crumbsUnderSell,
    deliveryAddress,
    favourites,
    howTheyGet,
    invoiceRow,
    kindOf,
    nextCredit,
    offersText,
    orderTiles,
    orderWhat,
    owedLine,
    packLines,
    paidText,
    sinceLine,
    tabFromQuery,
    tabsFor,
    tagFor,
} from "./view";

const IST = "Asia/Kolkata";
const NOW = new Date("2026-09-23T10:00:00Z");
const STORE = { id: "s1", name: "Rye & Co." };

function order(over: Partial<DetailOrder> = {}): DetailOrder {
    return {
        id: "o1",
        number: "1063",
        placedAt: "2026-09-23T07:14:00Z",
        status: "DELIVERED",
        paymentStatus: "PAID",
        itemCount: 1,
        items: [
            {
                productId: "p1",
                name: "Sourdough loaf",
                variant: "800g",
                quantity: 1,
            },
        ],
        fulfilmentType: "PICKUP",
        stage: "COLLECTED",
        delivery: null,
        total: "500.00",
        currency: "INR",
        via: { customerId: "c1", storefront: STORE },
        ...over,
    };
}

function booking(over: Partial<DetailBooking> = {}): DetailBooking {
    return {
        id: "b1",
        startAt: "2026-09-25T01:30:00Z",
        endAt: "2026-09-25T02:30:00Z",
        timezone: IST,
        service: { id: "sv1", name: "HIIT class" },
        isClass: true,
        staff: { id: "st1", name: "Vikram" },
        status: "CONFIRMED",
        outcome: null,
        paidWithPack: false,
        paidWith: "MEMBERSHIP",
        packName: null,
        cancelledLate: false,
        ...over,
    };
}

function shop(over: Partial<CustomerDetail> = {}): CustomerDetail {
    return {
        contact: {
            id: "c1",
            name: "Priya Raman",
            firstName: "Priya",
            lastName: "Raman",
            email: "priya@example.in",
            phone: null,
            company: null,
            source: null,
            createdAt: "2026-07-01T00:00:00Z",
        },
        money: true,
        timezone: IST,
        stats: {
            orders: 2,
            spent: [{ currency: "INR", amount: "1500.00" }],
            owed: { totals: [], unpaidCount: 0, overdueCount: 0 },
        },
        notes: { from: "contact", rows: [], allergenChoices: [] },
        allergens: [],
        linkedCustomers: [],
        possibleMatches: [],
        orders: {
            from: "linked-customers",
            rows: [
                order({ status: "PENDING", stage: "NEW" }),
                order({
                    id: "o2",
                    number: "1050",
                    placedAt: "2026-08-12T05:00:00Z",
                    fulfilmentType: "LOCAL_DELIVERY",
                    delivery: "14 Hill Road, Bengaluru",
                    total: "1000.00",
                }),
            ],
        },
        subscriptions: { from: "contact", rows: [] },
        invoices: { from: "contact", rows: [] },
        consent: { status: null, source: null, at: null },
        unavailable: [],
        ...over,
    };
}

function gym(over: Partial<CustomerDetail> = {}): CustomerDetail {
    const base = shop();
    delete base.orders;
    delete base.linkedCustomers;
    delete base.possibleMatches;
    return {
        ...base,
        stats: {
            bookings: 4,
            attended: 3,
            noShows: 1,
            lateCancels: 0,
            classesLeft: {
                total: 9,
                packs: 1,
                membership: 8,
                nextExpiry: "2026-10-20T00:00:00Z",
                allowance: {
                    subscriptionId: "sub1",
                    plan: "Yearly membership",
                    perMonth: 8,
                    used: 0,
                    left: 8,
                    resetsAt: "2026-09-30T18:30:00Z",
                    paused: false,
                },
            },
        },
        bookings: {
            from: "contact",
            upcoming: [booking()],
            past: [
                booking({
                    id: "b2",
                    startAt: "2026-09-10T01:30:00Z",
                    outcome: "NO_SHOW",
                }),
            ],
        },
        packs: { from: "contact", rows: [] },
        ...over,
    };
}

describe("the tabs, by business kind", () => {
    it("gives a shop Orders, Subscriptions, Invoices and Notes", () => {
        const d = shop();
        expect(kindOf(d)).toBe("commerce");
        expect(tabsFor(d).map((t) => t.label)).toEqual([
            "Overview",
            "Orders",
            "Subscriptions",
            "Invoices",
            "Notes",
        ]);
    });

    it("gives a bookings business Bookings, Packs and Membership", () => {
        const d = gym();
        expect(kindOf(d)).toBe("bookings");
        expect(tabsFor(d).map((t) => t.label)).toEqual([
            "Overview",
            "Bookings",
            "Packs",
            "Membership",
            "Invoices",
            "Notes",
        ]);
    });

    it("shows a Member no billing tabs: what the read leaves out has no tab", () => {
        const d = gym();
        delete d.subscriptions;
        delete d.invoices;
        delete d.packs;
        expect(tabsFor(d).map((t) => t.key)).toEqual(["over", "bk", "notes"]);
    });

    it("counts every pack on the Packs tab, and none when the read failed (C7)", () => {
        const pack = {
            id: "pp1",
            pack: { id: "p", name: "10 classes" },
            credits: 10,
            used: 3,
            left: 7,
            expiresAt: "2026-10-12T00:00:00Z",
            boughtAt: "2026-09-01T00:00:00Z",
            standing: "ACTIVE" as const,
        };
        const withTwo = gym({
            packs: {
                from: "contact",
                rows: [pack, { ...pack, id: "pp2", standing: "EXPIRED" }],
            },
        });
        expect(tabsFor(withTwo).find((t) => t.key === "pk")?.count).toBe(2);
        expect(
            tabsFor(gym({ packs: null })).find((t) => t.key === "pk")?.count,
        ).toBeNull();
        // Class packs off, Appointments off, or no `pack:read`: no tab, and
        // an old link to ?tab=pk opens Overview.
        const none = gym();
        delete none.packs;
        const tabs = tabsFor(none);
        expect(tabs.map((t) => t.key)).not.toContain("pk");
        expect(tabFromQuery("pk", tabs)).toBe("over");
        expect(tabFromQuery("pk", tabsFor(withTwo))).toBe("pk");
    });

    it("keeps a failed source's tab, without a count", () => {
        const d = shop({ invoices: null });
        expect(tabsFor(d).find((t) => t.key === "inv")?.count).toBeNull();
    });

    it("adds Messages before Notes, counting what's unread (A13)", () => {
        const thread = {
            messages: [],
            earlier: false,
            unread: 2,
            signsIn: true,
            canReply: true,
        };
        const tabs = tabsFor(gym(), thread);
        expect(tabs.map((t) => t.key)).toEqual([
            "over",
            "bk",
            "pk",
            "sub",
            "inv",
            "msg",
            "notes",
        ]);
        expect(tabs.find((t) => t.key === "msg")?.count).toBe(2);
        expect(
            tabsFor(gym(), { ...thread, unread: 0 }).find(
                (t) => t.key === "msg",
            )?.count,
        ).toBeNull();
        expect(
            tabsFor(gym(), "failed").find((t) => t.key === "msg")?.count,
        ).toBeNull();
        expect(tabsFor(gym(), null).map((t) => t.key)).not.toContain("msg");
        expect(tabFromQuery("msg", tabs)).toBe("msg");
    });

    it("adds Reviews after Invoices, counting every review, hidden too (C6)", () => {
        const review = (id: string, status: "PUBLISHED" | "HIDDEN") => ({
            id,
            rating: 5,
            body: "Lovely",
            displayName: "Asha R.",
            productId: "p1",
            productName: "Sourdough",
            storeId: "s1",
            invitedTo: "asha@example.in",
            status,
            reply: null,
            repliedAt: null,
            createdAt: "2026-09-20T10:00:00Z",
        });
        const thread = {
            messages: [],
            earlier: false,
            unread: 0,
            signsIn: true,
            canReply: true,
        };
        const tabs = tabsFor(shop(), thread, [
            review("r1", "PUBLISHED"),
            review("r2", "HIDDEN"),
        ]);
        expect(tabs.map((t) => t.label)).toEqual([
            "Overview",
            "Orders",
            "Subscriptions",
            "Invoices",
            "Reviews",
            "Messages",
            "Notes",
        ]);
        expect(tabs.find((t) => t.key === "rev")?.count).toBe(2);
        expect(tabFromQuery("rev", tabs)).toBe("rev");
        // None yet: the tab stays, with its 0 and the empty state.
        expect(
            tabsFor(shop(), null, []).find((t) => t.key === "rev")?.count,
        ).toBe(0);
    });

    it("keeps a failed Reviews read's tab without a count, and has none for a role that can't read reviews", () => {
        expect(
            tabsFor(shop(), null, "failed").find((t) => t.key === "rev")?.count,
        ).toBeNull();
        const noReviews = tabsFor(shop(), null, null);
        expect(noReviews.map((t) => t.key)).not.toContain("rev");
        // An old link to ?tab=rev opens Overview instead.
        expect(tabFromQuery("rev", noReviews)).toBe("over");
    });

    it("opens the tab the address names, else Overview", () => {
        const tabs = tabsFor(gym());
        expect(tabFromQuery("bk", tabs)).toBe("bk");
        expect(tabFromQuery("ord", tabs)).toBe("over");
        expect(tabFromQuery(undefined, tabs)).toBe("over");
    });
});

describe("the header", () => {
    it("calls a shop customer with two orders Returning, one New", () => {
        expect(tagFor(shop())?.label).toBe("Returning");
        expect(
            tagFor(shop({ stats: { ...shop().stats, orders: 1 } }))?.label,
        ).toBe("New");
    });

    it("calls a gym customer with a running membership a Member", () => {
        const d = gym({
            subscriptions: {
                from: "contact",
                rows: [
                    {
                        id: "sub1",
                        plan: { id: "pl", name: "Yearly membership" },
                        status: "ACTIVE",
                        interval: "YEAR",
                        price: "24000.00",
                        currency: "INR",
                        currentPeriodStart: "2026-01-04T00:00:00Z",
                        currentPeriodEnd: "2027-01-04T00:00:00Z",
                        nextChargeAt: "2027-01-04T00:00:00Z",
                        cancelAtPeriodEnd: false,
                        pausedAt: null,
                        cancelledAt: null,
                    },
                ],
            },
        });
        expect(tagFor(d)?.label).toBe("Member");
        expect(sinceLine(d, "Pulse Fitness", NOW)).toBe(
            "With Pulse Fitness since 4 Jan · 3 sessions attended",
        );
    });

    it("says no word when the orders it rests on are not read", () => {
        const d = shop();
        delete d.stats.orders;
        expect(tagFor(d)).toBeNull();
    });

    it("claims nothing about orders a Member does not read", () => {
        const d = shop();
        delete d.orders;
        expect(sinceLine(d, "Rye & Co.", NOW)).toBe("Added 1 Jul");
        expect(
            sinceLine(
                shop({ orders: { from: "linked-customers", rows: [] } }),
                null,
                NOW,
            ),
        ).toBe("Added 1 Jul · no orders yet");
    });

    it("says since when a shop customer buys, and where", () => {
        expect(sinceLine(shop(), "Rye & Co.", NOW)).toBe(
            "Customer since August 2026 · buys at Rye & Co.",
        );
    });

    it("says someone added on the Customers list was added by hand (DEC-056, C14)", () => {
        const today = shop({
            orders: { from: "linked-customers", rows: [] },
        });
        today.contact = {
            ...today.contact,
            source: ADDED_BY_HAND,
            createdAt: "2026-09-23T06:00:00Z",
        };
        expect(sinceLine(today, "Rye & Co.", NOW)).toBe(
            "Added by hand today · no orders yet",
        );
        expect(addedByHand(today)).toBe(true);
        const earlier = shop({
            orders: { from: "linked-customers", rows: [] },
        });
        earlier.contact = { ...earlier.contact, source: ADDED_BY_HAND };
        expect(sinceLine(earlier, "Rye & Co.", NOW)).toBe(
            "Added by hand on 1 Jul · no orders yet",
        );
        expect(addedByHand(shop())).toBe(false);
    });

    it("says what Returning means on the word itself", () => {
        expect(tagFor(shop())?.title).toBe("Returning: 2 or more orders");
    });
});

describe("a shop customer's overview", () => {
    it("draws four figures for an owner, the open orders named", () => {
        const tiles = orderTiles(shop(), NOW);
        expect(tiles.map((t) => [t.label, t.value, t.note])).toEqual([
            ["Orders", "2", "1 open, new"],
            ["Spent", "₹1,500", "Including delivery"],
            ["Average order", "₹750", "Across 2 orders"],
            ["Last order", "Today", "12:44 at Rye & Co."],
        ]);
    });

    it("leaves Spent out without order:read and invoice:read, keeping the average the orders show (C13)", () => {
        const d = shop({ money: false });
        delete d.stats.spent;
        expect(orderTiles(d, NOW).map((t) => t.label)).toEqual([
            "Orders",
            "Average order",
            "Last order",
        ]);
    });

    it("states no average from orders sent without totals (an API before C13)", () => {
        const d = shop({ money: false });
        delete d.stats.spent;
        for (const o of d.orders?.rows ?? []) {
            delete o.total;
            delete o.currency;
        }
        expect(orderTiles(d, NOW).map((t) => t.label)).toEqual([
            "Orders",
            "Last order",
        ]);
    });

    it("says what is still owed on the Spent tile", () => {
        const d = shop();
        d.stats.owed = {
            totals: [{ currency: "INR", amount: "300.00" }],
            unpaidCount: 1,
            overdueCount: 1,
        };
        expect(orderTiles(d, NOW)[1].note).toBe("₹300 still owed");
        expect(owedLine(d)).toBe("1 invoice unpaid · ₹300 — some overdue");
    });

    it("finds what they usually buy, and the size they take", () => {
        const rows = [
            order(),
            order({ id: "o2" }),
            order({
                id: "o3",
                items: [
                    {
                        productId: "p2",
                        name: "Almond croissant",
                        variant: null,
                        quantity: 2,
                    },
                ],
            }),
        ];
        expect(favourites(rows)).toEqual([
            {
                productId: "p1",
                name: "Sourdough loaf",
                note: "2 orders · usually 800g",
            },
            { productId: "p2", name: "Almond croissant", note: "1 order" },
        ]);
    });

    it("leaves a treatment's line out of what they usually buy (E9)", () => {
        const rows = [
            order({
                id: "o4",
                items: [
                    {
                        productId: null,
                        kind: "service",
                        name: "Root canal treatment",
                        variant: null,
                        quantity: 1,
                    },
                ],
            }),
        ];
        expect(favourites(rows)).toEqual([]);
    });

    it("says how they get their orders and where the last delivery went", () => {
        const rows = shop().orders?.rows ?? [];
        expect(howTheyGet(rows)).toBe(
            "Collects at Rye & Co. — 1 of 2 orders. The rest were delivered.",
        );
        expect(deliveryAddress(rows)).toBe("14 Hill Road, Bengaluru");
        expect(howTheyGet([order()])).toBe("Always collects at Rye & Co.");
        // Read from the type (DEC-045): a shipment is delivered too, and a
        // download is not.
        expect(howTheyGet([order({ fulfilmentType: "SHIPPING" })])).toBe(
            "Always delivered.",
        );
        expect(howTheyGet([order({ fulfilmentType: "PICKUP" })])).toBe(
            "Always collects at Rye & Co.",
        );
        expect(deliveryAddress([order()])).toBe(
            "No address — they have only collected.",
        );
        // The address kept on their record comes first (C8).
        expect(deliveryAddress(rows, "3 Lake View, Pune 411001")).toBe(
            "3 Lake View, Pune 411001",
        );
        expect(deliveryAddress([order()], "3 Lake View, Pune 411001")).toBe(
            "3 Lake View, Pune 411001",
        );
    });

    it("writes an order's lines, and how many more", () => {
        expect(
            orderWhat(
                order({
                    itemCount: 3,
                    items: [
                        {
                            productId: "p1",
                            name: "Sourdough loaf",
                            variant: null,
                            quantity: 2,
                        },
                    ],
                }),
            ),
        ).toBe("Sourdough loaf × 2 and 2 more");
    });
});

describe("a gym customer's bookings and classes", () => {
    it("writes a class booked on a membership", () => {
        expect(bookingRow(booking(), true, NOW)).toEqual(
            expect.objectContaining({
                day: "Fri 25 Sep",
                at: "07:00",
                what: "HIIT class",
                with: "Class with Vikram",
                pay: "Membership credit",
                state: { label: "Booked", tone: "accent" },
            }),
        );
    });

    it("says Paid, how much and how once money is in, not Pays at the desk (UX-049)", () => {
        const desk = booking({ paidWith: "DESK" });
        expect(bookingRow(desk, true, NOW).pay).toBe("Pays at the desk");
        const paid = booking({
            paidWith: "DESK",
            paid: { amount: "800.00", currency: "INR", method: "CASH" },
        });
        expect(bookingRow(paid, true, NOW).pay).toMatch(
            /^Paid ₹800(\.00)? · Cash$/,
        );
        expect(
            paidText({ amount: null, currency: null, method: "ONLINE" }),
        ).toBe("Paid · Online");
        expect(paidText(null)).toBeNull();
    });

    it("marks a no-show and a late cancel as the ones to ask about", () => {
        const late = booking({
            id: "b3",
            status: "CANCELLED",
            cancelledLate: true,
            startAt: "2026-09-12T01:30:00Z",
        });
        const lists = bookingLists({
            upcoming: [booking()],
            past: [...(gym().bookings?.past ?? []), late],
        });
        expect(lists.issue.list.map((b) => b.id)).toEqual(["b3", "b2"]);
        expect(bookingRow(late, false, NOW).state).toEqual({
            label: "Late cancel",
            tone: "bad",
        });
    });

    it("says the next class uses the membership while it has classes", () => {
        expect(nextCredit(gym())).toBe("Next class uses: membership");
    });

    it("says what a membership's classes become at its next renewal (D10)", () => {
        // 1 Nov 00:00 in Kolkata.
        const from = "2026-10-31T18:30:00Z";
        expect(
            allowanceChangeLine(
                { nextPeriod: { perMonth: 10, from } },
                IST,
                NOW,
            ),
        ).toBe("10 a month from 1 Nov");
        expect(
            allowanceChangeLine(
                { nextPeriod: { perMonth: null, from } },
                IST,
                NOW,
            ),
        ).toBe("Unlimited classes from 1 Nov");
        // Nothing changes, or an API from before D10.
        expect(allowanceChangeLine({ nextPeriod: null }, IST, NOW)).toBeNull();
        expect(allowanceChangeLine({}, IST, NOW)).toBeNull();
    });

    it("lists a pack with its use-by, soon in amber, and a lost one", () => {
        const pack = (over: Partial<DetailPack>): DetailPack => ({
            id: "pp1",
            pack: { id: "p", name: "5 classes" },
            credits: 5,
            used: 4,
            left: 1,
            expiresAt: "2026-10-01T00:00:00Z",
            boughtAt: "2026-08-21T00:00:00Z",
            standing: "ACTIVE",
            price: "2200.00",
            currency: "INR",
            ...over,
        });
        const lines = packLines(
            [
                pack({}),
                pack({
                    id: "pp2",
                    standing: "EXPIRED",
                    expiresAt: "2026-09-01T00:00:00Z",
                    left: 2,
                }),
            ],
            IST,
            NOW,
        );
        expect(lines[0]).toEqual(
            expect.objectContaining({
                name: "5 classes pack",
                // Each opens its Pack Detail (C7).
                href: "/class-packs/p",
                left: "Ended",
                sub: "Ran out 1 Sep with 2 unused",
            }),
        );
        expect(lines[1]).toEqual(
            expect.objectContaining({
                left: "1 of 5",
                bar: "accent",
                sub: "Use by 1 Oct — 8 days left · bought 21 Aug for ₹2,200",
            }),
        );
    });
});

describe("invoices and offers", () => {
    const invoice = (over: Partial<DetailInvoice>): DetailInvoice => ({
        id: "i1",
        number: "RC/26-27/0117",
        status: "PAID",
        standing: "PAID",
        source: "ORDER",
        kind: "INVOICE",
        orderId: "o1",
        orderNumber: "1063",
        planName: null,
        total: "1320.00",
        currency: "INR",
        issuedAt: "2026-09-23T07:14:00Z",
        dueAt: null,
        paidAt: "2026-09-23T07:14:00Z",
        ...over,
    });

    it("names where each invoice came from", () => {
        expect(invoiceRow(invoice({}), "commerce", IST, NOW)).toEqual(
            expect.objectContaining({
                from: "Order #1063",
                status: "Paid",
                tone: "ok",
                total: "₹1,320",
            }),
        );
        expect(
            invoiceRow(
                invoice({
                    source: "SUBSCRIPTION",
                    orderNumber: null,
                    planName: "Sourdough",
                    standing: "OVERDUE",
                }),
                "commerce",
                IST,
                NOW,
            ),
        ).toEqual(
            expect.objectContaining({
                from: "Sourdough subscription",
                status: "Overdue",
                tone: "off",
            }),
        );
        expect(
            invoiceRow(
                invoice({
                    source: "SUBSCRIPTION",
                    planName: "Standard membership",
                }),
                "bookings",
                IST,
                NOW,
            ).from,
        ).toBe("Standard membership");
    });

    it("never invents a yes to offers, and offers stop only after a yes (DEC-073)", () => {
        const none = { status: null, source: null, at: null };
        expect(offersText(none, IST, NOW)).toBe("Nothing recorded yet.");
        // Nothing recorded: nothing goes to them, so nothing to stop.
        expect(canStopOffers(none)).toBe(false);
        const yes = {
            status: "GRANTED",
            source: "checkout",
            at: "2026-09-18T00:00:00Z",
        };
        expect(offersText(yes, IST, NOW)).toBe(
            "Said yes to offers by email · 18 Sep",
        );
        expect(canStopOffers(yes)).toBe(true);
        const stopped = {
            status: "REVOKED",
            source: null,
            at: "2026-09-20T00:00:00Z",
        };
        expect(offersText(stopped, IST, NOW)).toBe("Asked to stop · 20 Sep");
        expect(canStopOffers(stopped)).toBe(false);
        expect(canStopOffers(null)).toBe(false);
    });
});

describe("where the crumbs file someone (UX-050)", () => {
    const link = {
        linkId: "l1",
        customerId: "cu1",
        name: "Riya",
        email: "riya@example.in",
        storefront: STORE,
        linkedAt: "2026-10-01T00:00:00Z",
    };

    it("files a buyer under Sell › Customers, anyone else under Contacts", () => {
        expect(crumbsUnderSell(true, { linkedCustomers: [link] })).toBe(true);
        expect(crumbsUnderSell(true, { linkedCustomers: [] })).toBe(false);
        expect(crumbsUnderSell(true, {})).toBe(false);
        expect(crumbsUnderSell(false, { linkedCustomers: [link] })).toBe(false);
    });
});
