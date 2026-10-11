import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountHome } from "./account-home";
import type { AccountLoadingShape } from "./account-loading";
import { AccountLoading } from "./account-loading";
import { AccountBookingPage } from "./booking-page";
import type { BookingsApi } from "./bookings-api";
import { AccountBookingsTab } from "./bookings-list";
import type { AccountBookingRow, AccountBookings } from "./bookings-model";
import { CoursesCard } from "./courses-card";
import type {
    AccountChange,
    AccountCourse,
    AccountInvoiceDue,
    AccountWaitlistPlace,
} from "./details-model";
import { EmailChoice, emailsAbout } from "./email-choice";
import { linkPendingLine, welcomeLead } from "./home-words";
import { InvoicesDue } from "./invoices-due";
import type {
    AccountOrderDetail,
    AccountView,
    AccountHome as HomeData,
} from "./model";
import { AccountOrderPage } from "./order-page";
import { SinceLastHere } from "./since-last-here";
import { WaitlistPlaces } from "./waitlist-places";

/**
 * What DEC-142 added to the customer's account, in jsdom: Home in the
 * order that matters to them, what changed since they were last here,
 * invoices to pay, a class's line, courses, the email choice, a page each
 * for one order and one booking, and every page's loading and failed
 * states. The look is the browser pass's; this pins the words, the order
 * in the page and the calls.
 */

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/account",
}));

beforeEach(() => {
    router.push.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
});

async function press(element: HTMLElement) {
    await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
    });
}

const NOW = "2026-10-12T06:00:00.000Z";

const ACCOUNT: AccountView = {
    name: "Farah Khan",
    email: "farah@example.com",
    phone: null,
    businessName: "Pulse Fitness",
    tabs: [
        { key: "home", label: "Home" },
        { key: "bookings", label: "Bookings" },
        { key: "orders", label: "Orders" },
        { key: "messages", label: "Messages" },
        { key: "me", label: "Your details" },
    ],
    offers: { appointments: true, orders: true, plans: false },
    bookingsLabel: "Bookings",
    healthNotes: false,
    unreadMessages: 0,
};

const INVOICE: AccountInvoiceDue = {
    ref: "inv_1",
    number: "INV-0042",
    what: "Unlimited, October",
    issuedAt: "2026-10-01T05:00:00.000Z",
    dueAt: "2026-10-08T05:00:00.000Z",
    overdue: true,
    total: "2500.00",
    currency: "INR",
    billOfSupply: false,
    pay: "online",
};

const HELD: AccountWaitlistPlace = {
    service: "Morning flow",
    serviceRef: "svc_1",
    startAt: "2026-10-14T03:30:00.000Z",
    timezone: "Asia/Kolkata",
    status: "OFFERED",
    placeInLine: null,
    offeredUntil: "2026-10-12T07:30:00.000Z",
};
const WAITING: AccountWaitlistPlace = {
    ...HELD,
    service: "Evening flow",
    serviceRef: "svc_2",
    status: "WAITING",
    placeInLine: 2,
    offeredUntil: null,
};

const COURSE: AccountCourse = {
    ref: "enr_1",
    name: "Pottery, four weeks",
    firstAt: "2026-10-05T04:30:00.000Z",
    lastAt: "2026-10-26T04:30:00.000Z",
    timezone: "Asia/Kolkata",
    sessions: 4,
    attended: 1,
    missed: 0,
    left: 3,
    nextAt: "2026-10-19T04:30:00.000Z",
};

const ORDER_OPEN = {
    ref: "ord_1",
    number: "1019",
    placedAt: "2026-10-10T00:00:00.000Z",
    total: "450.00",
    currency: "INR",
    open: true,
    status: "Ready",
    fulfilment: "Pick-up",
    items: [{ name: "Protein bar", quantity: 2 }],
    moreItems: 0,
};

const BOOKING = {
    ref: "bk_1",
    service: "Check-up",
    startAt: "2026-10-15T04:30:00.000Z",
    endAt: "2026-10-15T05:00:00.000Z",
    timezone: "Asia/Kolkata",
    staff: "Dr. Rao",
    online: false,
};

function home(over: Partial<HomeData> = {}): HomeData {
    return {
        nextBooking: { ok: true, value: null },
        classes: { ok: true, value: null },
        orders: { ok: true, value: [] },
        plan: { ok: true, value: null },
        changes: { ok: true, value: [] },
        since: null,
        invoicesDue: { ok: true, value: [] },
        waitlist: { ok: true, value: [] },
        courses: { ok: true, value: [] },
        linkPending: false,
        ...over,
    };
}

/** The cards' headings, in the order the page reads them. */
const headings = () =>
    screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("Home, in the order that matters to this customer (DEC-142)", () => {
    const DOORS = { bookHref: "/book", shopHref: "/shop" };

    it("a customer with one order reads the order first, and Book a time last", () => {
        render(
            <AccountHome
                account={ACCOUNT}
                home={home({ orders: { ok: true, value: [ORDER_OPEN] } })}
                doors={DOORS}
                now={NOW}
            />,
        );
        expect(headings()).toEqual(["Your orders", "More you can do here"]);
        // Never "Next booking: Nothing booked" above what they do have.
        expect(screen.queryByText("Nothing booked")).toBeNull();
        expect(
            screen.getByRole("link", { name: "Book a time" }),
        ).toHaveAttribute("href", "/book");
        // An order is already on its way: the shop isn't offered again.
        expect(
            screen.queryByRole("link", { name: "Go to the shop" }),
        ).toBeNull();
        // The order's title leads to its own page; Track still opens its sheet.
        expect(
            screen.getByRole("link", { name: "#1019 · 2 × Protein bar" }),
        ).toHaveAttribute("href", "/account/orders/ord_1");
        expect(
            screen.getByRole("link", { name: "Track order #1019" }),
        ).toHaveAttribute("href", "/account/orders?order=ord_1");
    });

    it("what changed leads; then a held place, money owed, a booking, an order, a message; then what they hold", () => {
        const changes: AccountChange[] = [
            {
                kind: "order",
                ref: "ord_1",
                number: "1019",
                status: "Ready",
                at: "2026-10-11T09:00:00.000Z",
            },
        ];
        render(
            <AccountHome
                account={{ ...ACCOUNT, unreadMessages: 2 }}
                home={home({
                    changes: { ok: true, value: changes },
                    waitlist: { ok: true, value: [HELD, WAITING] },
                    invoicesDue: { ok: true, value: [INVOICE] },
                    nextBooking: { ok: true, value: BOOKING },
                    orders: { ok: true, value: [ORDER_OPEN] },
                    courses: { ok: true, value: [COURSE] },
                })}
                doors={DOORS}
                now={NOW}
            />,
        );
        expect(headings()).toEqual([
            "Since you were last here",
            "A place is held for you",
            "To pay",
            "Next up",
            "Your orders",
            "Messages",
            "Your courses",
            "Waiting for a place",
        ]);
        // Nothing left to offer: a booking and an order are under way.
        expect(screen.queryByText("More you can do here")).toBeNull();
        // A booking that is still to come may read "Booked".
        const next = screen.getByRole("region", { name: "Next up" });
        expect(within(next).getByText("Booked")).toBeInTheDocument();
        expect(
            within(next).getByRole("link", {
                name: "Check-up · Thu 15 Oct, 10:00 am",
            }),
        ).toHaveAttribute("href", "/account/bookings/bk_1");
        expect(
            screen.getByText("2 new messages from Pulse Fitness."),
        ).toBeInTheDocument();
    });

    it("offers only what the business offers and the site can serve", () => {
        // A shop that takes no bookings, with a finished order.
        render(
            <AccountHome
                account={{
                    ...ACCOUNT,
                    offers: { appointments: false, orders: true, plans: false },
                }}
                home={home({
                    nextBooking: null,
                    waitlist: null,
                    orders: {
                        ok: true,
                        value: [
                            { ...ORDER_OPEN, open: false, status: "Collected" },
                        ],
                    },
                })}
                doors={{ bookHref: null, shopHref: "/shop" }}
                now={NOW}
            />,
        );
        expect(headings()).toEqual(["Your orders", "More you can do here"]);
        expect(screen.queryByRole("link", { name: "Book a time" })).toBeNull();
        expect(
            screen.getByRole("link", { name: "Go to the shop" }),
        ).toHaveAttribute("href", "/shop");
        expect(
            screen.getByText("See what's on sale and order online."),
        ).toBeInTheDocument();
    });

    it("with nothing at all, one welcome block; and it says what is true when staff haven't linked the account", () => {
        const { unmount } = render(
            <AccountHome
                account={ACCOUNT}
                home={home()}
                doors={DOORS}
                now={NOW}
            />,
        );
        expect(headings()).toEqual(["Nothing here yet"]);
        expect(
            screen.getByText(
                "Once you book or order with Pulse Fitness, you'll find it here: what you've booked, where your order is, your receipts and your messages.",
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Been a customer before/)).toBeNull();
        expect(
            screen.getByRole("link", { name: "Message Pulse Fitness" }),
        ).toHaveAttribute("href", "/account/messages");
        unmount();

        render(
            <AccountHome
                account={ACCOUNT}
                home={home({ linkPending: true })}
                doors={DOORS}
                now={NOW}
            />,
        );
        expect(
            screen.getByText(
                "Been a customer before? Earlier bookings and orders aren't on this account until Pulse Fitness has checked it's you. Send them a message to ask.",
            ),
        ).toBeInTheDocument();
    });

    it("the linking note is only for an empty Home: with something to show, it isn't said", () => {
        render(
            <AccountHome
                account={ACCOUNT}
                home={home({
                    linkPending: true,
                    orders: { ok: true, value: [ORDER_OPEN] },
                })}
                doors={DOORS}
                now={NOW}
            />,
        );
        expect(screen.queryByText(/Been a customer before/)).toBeNull();
    });

    it("a failed read says so in its own block, and never reads as nothing", () => {
        render(
            <AccountHome
                account={ACCOUNT}
                home={home({
                    changes: { ok: false },
                    invoicesDue: { ok: false },
                    waitlist: { ok: false },
                    courses: { ok: false },
                })}
                doors={DOORS}
                now={NOW}
            />,
        );
        expect(
            screen.getByText(
                /couldn't check what changed since your last visit/,
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Your invoices couldn't be loaded/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Your places in line couldn't be loaded/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Your courses couldn't be loaded/),
        ).toBeInTheDocument();
        // Not the welcome block: we don't know that there is nothing.
        expect(screen.queryByText("Nothing here yet")).toBeNull();
    });

    it("the blocks are one grid, two columns from tablet width up, in the page's own order", () => {
        const { container } = render(
            <AccountHome
                account={ACCOUNT}
                home={home({
                    nextBooking: { ok: true, value: BOOKING },
                    orders: { ok: true, value: [ORDER_OPEN] },
                    invoicesDue: { ok: true, value: [INVOICE] },
                })}
                doors={DOORS}
                now={NOW}
            />,
        );
        const grid = container.firstElementChild;
        expect(grid?.className).toMatch(/\bgrid\b/);
        expect(grid?.className).toMatch(/\bmd:grid-cols-2\b/);
        // Three half-width cards: the first takes the row, none sits alone.
        const cards = Array.from(grid?.children ?? []);
        expect(cards.map((c) => c.getAttribute("aria-labelledby"))).toEqual([
            "account-to-pay",
            "account-next",
            "account-orders",
        ]);
        expect(cards[0]?.className).toMatch(/\bmd:col-span-2\b/);
        expect(cards[1]?.className).not.toMatch(/\bmd:col-span-2\b/);
    });
});

describe("the welcome block's words", () => {
    it("names only what this business offers", () => {
        const base = { businessName: "Rye & Co.", tabs: ACCOUNT.tabs };
        expect(
            welcomeLead({
                ...base,
                offers: { appointments: false, orders: true, plans: false },
            }),
        ).toBe(
            "Once you order with Rye & Co., you'll find it here: where your order is, your receipts and your messages.",
        );
        expect(
            welcomeLead({
                businessName: "Rye & Co.",
                tabs: [],
                offers: { appointments: false, orders: false, plans: true },
            }),
        ).toBe("This is where you'll find your receipts with Rye & Co..");
    });

    it("the linking note asks by message only where there are messages", () => {
        expect(linkPendingLine("Rye & Co.", null)).toContain(
            "Ask them next time you're in touch.",
        );
        expect(linkPendingLine("Rye & Co.", "/account/messages")).toContain(
            "Send them a message to ask.",
        );
    });
});

describe("Since you were last here", () => {
    const changes: AccountChange[] = [
        {
            kind: "booking-moved",
            ref: "bk_1",
            service: "Check-up",
            startAt: "2026-10-15T05:00:00.000Z",
            timezone: "Asia/Kolkata",
            at: "2026-10-11T09:00:00.000Z",
        },
        { kind: "messages", count: 1, at: "2026-10-10T09:00:00.000Z" },
    ];

    it("lists each change as a link to the thing, naming the business", () => {
        render(
            <SinceLastHere
                changes={changes}
                businessName="Kavi Dental"
                messagesHref="/account/messages"
                now={NOW}
            />,
        );
        const card = screen.getByRole("region", {
            name: "Since you were last here",
        });
        const rows = within(card).getAllByRole("listitem");
        expect(rows).toHaveLength(2);
        expect(
            within(card).getByRole("link", {
                name: "Kavi Dental moved Check-up to Thu 15 Oct, 10:30 am",
            }),
        ).toHaveAttribute("href", "/account/bookings/bk_1");
        expect(
            within(card).getByRole("link", {
                name: "A new message from Kavi Dental",
            }),
        ).toHaveAttribute("href", "/account/messages");
    });

    it("draws nothing when nothing changed, and says so when it couldn't find out", () => {
        const { container, rerender } = render(
            <SinceLastHere
                changes={[]}
                businessName="Kavi Dental"
                messagesHref={null}
                now={NOW}
            />,
        );
        expect(container).toBeEmptyDOMElement();
        rerender(
            <SinceLastHere
                changes={[]}
                failed
                businessName="Kavi Dental"
                messagesHref={null}
                now={NOW}
            />,
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "We couldn't check what changed since your last visit.",
        );
        expect(screen.queryByText("Since you were last here")).toBeNull();
    });
});

describe("invoices to pay", () => {
    function withLocation() {
        const assign = vi.fn();
        const original = window.location;
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...original, assign },
        });
        return {
            assign,
            restore: () =>
                Object.defineProperty(window, "location", {
                    configurable: true,
                    value: original,
                }),
        };
    }

    it("Pay now asks for a link made that moment, and goes to it", async () => {
        const location = withLocation();
        const payNow = vi.fn().mockResolvedValue({
            ok: true,
            url: "https://pulse.saroh.app/pay/fresh",
        });
        render(
            <InvoicesDue
                invoices={{ ok: true, value: [INVOICE] }}
                businessName="Pulse Fitness"
                payNow={payNow}
            />,
        );
        const card = screen.getByRole("region", { name: "To pay" });
        expect(
            within(card).getByText("Invoice INV-0042 · ₹2,500"),
        ).toBeInTheDocument();
        expect(
            within(card).getByText("Unlimited, October · Was due 8 Oct 2026"),
        ).toBeInTheDocument();
        expect(within(card).getByText("Overdue")).toBeInTheDocument();
        // The page holds no link of its own: nothing to go stale.
        expect(within(card).queryByRole("link")).toBeNull();
        await press(
            within(card).getByRole("button", {
                name: "Pay invoice INV-0042 now",
            }),
        );
        expect(payNow).toHaveBeenCalledWith("inv_1");
        expect(location.assign).toHaveBeenCalledWith(
            "https://pulse.saroh.app/pay/fresh",
        );
        location.restore();
    });

    it("a refusal is said, and the page stays", async () => {
        const location = withLocation();
        const payNow = vi.fn().mockResolvedValue({
            ok: false,
            message: "Autopay charge in progress",
        });
        render(
            <InvoicesDue
                invoices={{ ok: true, value: [INVOICE] }}
                businessName="Pulse Fitness"
                payNow={payNow}
            />,
        );
        await press(screen.getByRole("button", { name: /Pay invoice/ }));
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Autopay charge in progress",
        );
        expect(location.assign).not.toHaveBeenCalled();
        // And it can be tried again.
        expect(
            screen.getByRole("button", { name: /Pay invoice/ }),
        ).not.toBeDisabled();
        location.restore();
    });

    it("no Pay now where the business can't take it online, or autopay is charging it", () => {
        render(
            <InvoicesDue
                invoices={{
                    ok: true,
                    value: [
                        { ...INVOICE, pay: "direct" },
                        { ...INVOICE, ref: "inv_2", pay: "charging" },
                    ],
                }}
                businessName="Pulse Fitness"
                payNow={vi.fn()}
            />,
        );
        expect(screen.queryByRole("button")).toBeNull();
        expect(
            screen.getByText(/Pay Pulse Fitness directly/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Autopay charge in progress/),
        ).toBeInTheDocument();
    });

    it("with none: no card on Home, and a plain line where the page asks for one", () => {
        const { container, rerender } = render(
            <InvoicesDue
                invoices={{ ok: true, value: [] }}
                businessName="Pulse Fitness"
                payNow={vi.fn()}
            />,
        );
        expect(container).toBeEmptyDOMElement();
        rerender(
            <InvoicesDue
                id="to-pay"
                invoices={{ ok: true, value: [] }}
                businessName="Pulse Fitness"
                payNow={vi.fn()}
                whenNone="Nothing to pay."
            />,
        );
        const card = screen.getByRole("region", { name: "To pay" });
        expect(card).toHaveAttribute("id", "to-pay");
        expect(within(card).getByText("Nothing to pay.")).toBeInTheDocument();
    });

    it("a failed read says so, never that nothing is owed", () => {
        render(
            <InvoicesDue
                invoices={{ ok: false }}
                businessName="Pulse Fitness"
                payNow={vi.fn()}
                whenNone="Nothing to pay."
            />,
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "Your invoices couldn't be loaded. Refresh the page to try again.",
        );
        expect(screen.queryByText("Nothing to pay.")).toBeNull();
    });
});

describe("a class's line", () => {
    it("a held place says until when, with the way to book it; a line says where they stand", () => {
        render(
            <WaitlistPlaces
                places={{ ok: true, value: [HELD, WAITING] }}
                leave={vi.fn()}
                now={NOW}
            />,
        );
        const card = screen.getByRole("region", { name: "Places in line" });
        expect(
            within(card).getByText("A place is held for you until 1:00 pm"),
        ).toBeInTheDocument();
        expect(within(card).getByText("Held for you")).toBeInTheDocument();
        expect(
            within(card).getByRole("link", {
                name: "Book this place: Morning flow · Wed 14 Oct, 9:00 am",
            }),
        ).toHaveAttribute("href", "/book?service=svc_1&date=2026-10-14");
        expect(
            within(card).getByText("1 person is ahead of you"),
        ).toBeInTheDocument();
        expect(within(card).getByText("In line")).toBeInTheDocument();
    });

    it("Home draws the held ones and the waiting ones apart", () => {
        const places = { ok: true as const, value: [HELD, WAITING] };
        const { unmount } = render(
            <WaitlistPlaces
                places={places}
                show="held"
                leave={vi.fn()}
                now={NOW}
            />,
        );
        expect(
            screen.getByRole("region", { name: "A place is held for you" }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Evening flow/)).toBeNull();
        unmount();
        render(
            <WaitlistPlaces
                places={places}
                show="waiting"
                leave={vi.fn()}
                now={NOW}
            />,
        );
        expect(
            screen.getByRole("region", { name: "Waiting for a place" }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Morning flow/)).toBeNull();
    });

    it("leaving gives the place up, says so, and reads the page again", async () => {
        const leave = vi.fn().mockResolvedValue({ ok: true });
        render(
            <WaitlistPlaces
                places={{ ok: true, value: [WAITING] }}
                leave={leave}
                now={NOW}
            />,
        );
        await press(
            screen.getByRole("button", {
                name: "Leave the line for Evening flow · Wed 14 Oct, 9:00 am",
            }),
        );
        expect(leave).toHaveBeenCalledWith("svc_2", WAITING.startAt);
        expect(screen.getByRole("status")).toHaveTextContent(
            "You've left the line for Evening flow · Wed 14 Oct, 9:00 am.",
        );
        expect(screen.queryByText("1 person is ahead of you")).toBeNull();
        expect(router.refresh).toHaveBeenCalled();
    });

    it("a leave that didn't take says why, and the place stays", async () => {
        const leave = vi.fn().mockResolvedValue({
            ok: false,
            message: "We couldn't reach the business. Try again in a moment.",
        });
        render(
            <WaitlistPlaces
                places={{ ok: true, value: [WAITING] }}
                leave={leave}
                now={NOW}
            />,
        );
        await press(screen.getByRole("button", { name: /Leave the line/ }));
        expect(screen.getByRole("alert")).toHaveTextContent(
            "We couldn't reach the business.",
        );
        expect(
            screen.getByText("1 person is ahead of you"),
        ).toBeInTheDocument();
    });

    it("no place draws no card; a failed read says so", () => {
        const { container, rerender } = render(
            <WaitlistPlaces
                places={{ ok: true, value: [] }}
                leave={vi.fn()}
                now={NOW}
            />,
        );
        expect(container).toBeEmptyDOMElement();
        rerender(
            <WaitlistPlaces places={{ ok: false }} leave={vi.fn()} now={NOW} />,
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "Your places in line couldn't be loaded.",
        );
    });
});

describe("courses", () => {
    it("shows each course read-only: its dates, their sessions and the next one", () => {
        render(<CoursesCard courses={{ ok: true, value: [COURSE] }} />);
        const card = screen.getByRole("region", { name: "Your courses" });
        expect(
            within(card).getByText("Pottery, four weeks"),
        ).toBeInTheDocument();
        expect(
            within(card).getByText(
                /5 Oct to 26 Oct 2026 · 4 sessions · 1 attended · 3 to come/,
            ),
        ).toBeInTheDocument();
        expect(
            within(card).getByText("Next: Mon 19 Oct, 10:00 am"),
        ).toBeInTheDocument();
        // Nothing to move or cancel here.
        expect(within(card).queryByRole("button")).toBeNull();
        expect(within(card).queryByRole("link")).toBeNull();
    });

    it("no course draws nothing; a failed read says so", () => {
        const { container, rerender } = render(
            <CoursesCard courses={{ ok: true, value: [] }} />,
        );
        expect(container).toBeEmptyDOMElement();
        rerender(<CoursesCard courses={{ ok: false }} />);
        expect(screen.getByRole("status")).toHaveTextContent(
            "Your courses couldn't be loaded.",
        );
    });
});

describe("whether the business may email them", () => {
    const account = {
        businessName: "Kavi Dental",
        email: "farah@example.com",
        offers: { appointments: true, orders: false, plans: false },
    };

    it("says what the emails are about, by what the business offers", () => {
        expect(emailsAbout(account.offers)).toBe("bookings and invoices");
        expect(
            emailsAbout({ appointments: true, orders: true, plans: false }),
        ).toBe("bookings, orders and invoices");
        expect(
            emailsAbout({ appointments: false, orders: false, plans: true }),
        ).toBe("invoices");
    });

    it("one switch, on until they say no; turning it off saves and says so", async () => {
        const save = vi
            .fn()
            .mockResolvedValue({ ok: true, notices: { email: false } });
        render(
            <EmailChoice
                notices={{ ok: true, value: { email: true } }}
                account={account}
                save={save}
            />,
        );
        const toggle = screen.getByRole("switch", {
            name: "Kavi Dental may email me",
        });
        expect(toggle).toHaveAttribute("aria-checked", "true");
        // Sign-in codes are not the business's to stop.
        expect(
            screen.getByText(/Sign-in codes are always sent/),
        ).toBeInTheDocument();
        await press(toggle);
        expect(save).toHaveBeenCalledWith(false);
        expect(toggle).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("status")).toHaveTextContent(
            "Saved. Kavi Dental won't email you.",
        );
    });

    it("a save that didn't take puts the switch back and says why", async () => {
        const save = vi.fn().mockResolvedValue({
            ok: false,
            message: "We couldn't reach the business. Try again in a moment.",
        });
        render(
            <EmailChoice
                notices={{ ok: true, value: { email: false } }}
                account={account}
                save={save}
            />,
        );
        const toggle = screen.getByRole("switch");
        await press(toggle);
        expect(save).toHaveBeenCalledWith(true);
        expect(toggle).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("alert")).toHaveTextContent(
            "We couldn't reach the business.",
        );
    });

    it("a failed read says so, and offers no switch that might be wrong", () => {
        render(
            <EmailChoice
                notices={{ ok: false }}
                account={account}
                save={vi.fn()}
            />,
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "Your email choice couldn't be loaded.",
        );
        expect(screen.queryByRole("switch")).toBeNull();
    });
});

describe("one order's own page", () => {
    const order: AccountOrderDetail = {
        ref: "ord_1",
        number: "1019",
        placedAt: "2026-10-10T00:00:00.000Z",
        total: "450.00",
        currency: "INR",
        fulfilment: "Pick-up",
        state: "open",
        status: "Ready",
        lines: [
            { name: "Protein bar", quantity: 2, kind: "product", visits: null },
        ],
        steps: [
            {
                label: "Placed",
                state: "done",
                line: "",
                at: "2026-10-10T00:00:00.000Z",
            },
            {
                label: "Ready",
                state: "now",
                line: "Ready to collect",
                at: null,
            },
            { label: "Collected", state: "next", line: "", at: null },
        ],
        courier: null,
        refund: null,
        receipt: "inv_9",
        collectFrom: { address: "12 MG Road, Bengaluru", hours: "9am–7pm" },
    };

    it("draws the order's Track, the way back, its receipt and a way to write", () => {
        render(
            <AccountOrderPage
                lookup={{ ok: true, order }}
                businessName="Pulse Fitness"
                messagesHref="/account/messages"
                ordersTab
            />,
        );
        expect(screen.getByRole("link", { name: /Orders/ })).toHaveAttribute(
            "href",
            "/account/orders",
        );
        const card = screen.getByRole("region", { name: "Order #1019" });
        const steps = within(card).getByRole("list", { name: "Where it is" });
        expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
        expect(within(steps).getByText("Ready").closest("li")).toHaveAttribute(
            "aria-current",
            "step",
        );
        expect(
            within(card).getByText(/12 MG Road, Bengaluru/),
        ).toBeInTheDocument();
        expect(
            within(card).getByRole("link", { name: "See the receipt" }),
        ).toHaveAttribute("href", "/account/receipts/inv_9");
        expect(
            within(card).getByRole("link", { name: "Message Pulse Fitness" }),
        ).toHaveAttribute("href", "/account/messages");
    });

    it("another customer's order, or one that isn't there, is said as not found, with the way back", () => {
        render(
            <AccountOrderPage
                lookup={{ ok: false, reason: "missing" }}
                businessName="Pulse Fitness"
                messagesHref={null}
                ordersTab={false}
            />,
        );
        expect(
            screen.getByRole("heading", { name: "Order not found" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("We couldn't find that order in your account."),
        ).toBeInTheDocument();
        // No Orders tab at this business: back to Home.
        expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute(
            "href",
            "/account",
        );
    });

    it("an order that couldn't be read says that, never that it isn't there", () => {
        render(
            <AccountOrderPage
                lookup={{ ok: false, reason: "unavailable" }}
                businessName="Pulse Fitness"
                messagesHref={null}
                ordersTab
            />,
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "This order couldn't be loaded. Refresh the page to try again.",
        );
        expect(screen.queryByText(/couldn't find that order/)).toBeNull();
    });
});

const ROW: AccountBookingRow = {
    ref: "bk_1",
    service: "Check-up",
    serviceRef: "svc_9",
    startAt: "2026-10-15T04:30:00.000Z",
    endAt: "2026-10-15T05:00:00.000Z",
    timezone: "Asia/Kolkata",
    staff: "Dr. Rao",
    online: false,
    state: "booked",
    kind: "one",
    visit: null,
    cancelledLate: false,
    move: "sheet",
    cancel: { late: false, freeUntil: null, money: "none", credit: null },
    paid: null,
};

function bookingsApi(over: Partial<BookingsApi> = {}): BookingsApi {
    return {
        moveTimes: vi.fn().mockResolvedValue({
            ok: true,
            times: {
                service: "Check-up",
                staff: "Dr. Rao",
                timezone: "Asia/Kolkata",
                times: ["2026-10-16T05:30:00.000Z"],
            },
        }),
        move: vi.fn().mockResolvedValue({ ok: true, booking: ROW }),
        cancel: vi.fn().mockResolvedValue({
            ok: true,
            result: {
                booking: { ...ROW, state: "cancelled" },
                refund: null,
                kept: null,
                order: false,
                told: true,
            },
        }),
        visitTimes: vi.fn(),
        bookVisit: vi.fn(),
        ...over,
    };
}

describe("one booking's own page", () => {
    it("says what, when and with whom, and cancels in a sheet on this page", async () => {
        const api = bookingsApi();
        render(
            <AccountBookingPage
                lookup={{ ok: true, booking: ROW }}
                businessName="Kavi Dental"
                phone={null}
                api={api}
                bookingsTab
                now={NOW}
            />,
        );
        expect(screen.getByRole("link", { name: /Bookings/ })).toHaveAttribute(
            "href",
            "/account/bookings",
        );
        const card = screen.getByRole("region", {
            name: "Check-up · Thu 15 Oct, 10:00 am",
        });
        expect(within(card).getByText("Booked")).toBeInTheDocument();
        expect(within(card).getByText("With Dr. Rao")).toBeInTheDocument();
        expect(within(card).getByText("Free to cancel.")).toBeInTheDocument();
        expect(
            within(card).getByRole("button", { name: "Move" }),
        ).toBeInTheDocument();

        await press(within(card).getByRole("button", { name: "Cancel" }));
        const sheet = screen.getByRole("dialog");
        await press(
            within(sheet).getByRole("button", { name: "Yes, cancel it" }),
        );
        expect(api.cancel).toHaveBeenCalledWith("bk_1");
        // Said here; the page reads the booking again, and never leaves.
        expect(screen.getByRole("status")).toHaveTextContent(
            "Cancelled. The team has been told.",
        );
        expect(router.refresh).toHaveBeenCalled();
        expect(router.push).not.toHaveBeenCalled();
        expect(router.replace).not.toHaveBeenCalled();
    });

    it("a booking that is over reads its date alone until it is marked, with nothing to move or cancel", () => {
        const over: AccountBookingRow = {
            ...ROW,
            startAt: "2026-10-05T04:30:00.000Z",
            endAt: "2026-10-05T05:00:00.000Z",
            move: null,
            cancel: null,
        };
        const { unmount } = render(
            <AccountBookingPage
                lookup={{ ok: true, booking: over }}
                businessName="Kavi Dental"
                phone={null}
                api={bookingsApi()}
                bookingsTab
                now={NOW}
            />,
        );
        expect(
            screen.getByRole("heading", {
                name: "Check-up · Mon 5 Oct, 10:00 am",
            }),
        ).toBeInTheDocument();
        expect(screen.queryByText("Booked")).toBeNull();
        expect(screen.queryByText("Attended")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
        unmount();

        render(
            <AccountBookingPage
                lookup={{ ok: true, booking: { ...over, state: "attended" } }}
                businessName="Kavi Dental"
                phone={null}
                api={bookingsApi()}
                bookingsTab
                now={NOW}
            />,
        );
        expect(screen.getByText("Attended")).toBeInTheDocument();
    });

    it("not theirs, or not there, is not found; unreadable says that instead", () => {
        const { unmount } = render(
            <AccountBookingPage
                lookup={{ ok: false, reason: "missing" }}
                businessName="Kavi Dental"
                phone={null}
                api={bookingsApi()}
                bookingsTab={false}
                now={NOW}
            />,
        );
        expect(
            screen.getByRole("heading", { name: "Booking not found" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("We couldn't find that booking in your account."),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute(
            "href",
            "/account",
        );
        unmount();

        render(
            <AccountBookingPage
                lookup={{ ok: false, reason: "unavailable" }}
                businessName="Kavi Dental"
                phone={null}
                api={bookingsApi()}
                bookingsTab
                now={NOW}
            />,
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "This booking couldn't be loaded. Refresh the page to try again.",
        );
        expect(screen.queryByText(/couldn't find that booking/)).toBeNull();
    });
});

describe("the Bookings tab, with what DEC-142 added", () => {
    const lists: AccountBookings = {
        comingUp: [ROW],
        past: [
            {
                ...ROW,
                ref: "bk_old",
                startAt: "2026-10-05T04:30:00.000Z",
                endAt: "2026-10-05T05:00:00.000Z",
                move: null,
                cancel: null,
            },
            {
                ...ROW,
                ref: "bk_seen",
                service: "Cleaning",
                startAt: "2026-09-28T04:30:00.000Z",
                endAt: "2026-09-28T05:00:00.000Z",
                state: "attended",
                move: null,
                cancel: null,
            },
            {
                ...ROW,
                ref: "bk_miss",
                service: "X-ray",
                startAt: "2026-09-21T04:30:00.000Z",
                endAt: "2026-09-21T05:00:00.000Z",
                state: "missed",
                move: null,
                cancel: null,
            },
        ],
        cancelled: [],
        treatments: [],
    };

    it('a past booking never reads "Booked": the date alone, and Attended or Missed only when marked', () => {
        render(
            <AccountBookingsTab
                bookings={{ ok: true, value: lists }}
                businessName="Kavi Dental"
                phone={null}
                api={bookingsApi()}
            />,
        );
        const past = screen.getByRole("region", { name: "Past" });
        expect(within(past).queryByText("Booked")).toBeNull();
        expect(
            within(past).getByText("Check-up · Mon 5 Oct, 10:00 am"),
        ).toBeInTheDocument();
        expect(within(past).getByText("Attended")).toBeInTheDocument();
        expect(within(past).getByText("Missed")).toBeInTheDocument();
        // What is still to come may say so.
        const up = screen.getByRole("region", { name: "Coming up" });
        expect(within(up).getByText("Booked")).toBeInTheDocument();
        // Each booking's title leads to its own page.
        expect(
            within(up).getByRole("link", {
                name: "Check-up · Thu 15 Oct, 10:00 am",
            }),
        ).toHaveAttribute("href", "/account/bookings/bk_1");
    });

    it("lists their places in line first, and their courses, when they have any", () => {
        render(
            <AccountBookingsTab
                bookings={{ ok: true, value: lists }}
                businessName="Kavi Dental"
                phone={null}
                api={bookingsApi()}
                waitlist={{ ok: true, value: [HELD] }}
                courses={{ ok: true, value: [COURSE] }}
                leaveLine={vi.fn()}
                now={NOW}
            />,
        );
        expect(headings()).toEqual([
            "Places in line",
            "Coming up",
            "Past",
            "Your courses",
        ]);
    });

    it("draws neither for a customer with none, nor for a caller from before them", () => {
        render(
            <AccountBookingsTab
                bookings={{ ok: true, value: lists }}
                businessName="Kavi Dental"
                phone={null}
                api={bookingsApi()}
                waitlist={{ ok: true, value: [] }}
                courses={{ ok: true, value: [] }}
                leaveLine={vi.fn()}
                now={NOW}
            />,
        );
        expect(headings()).toEqual(["Coming up", "Past"]);
    });
});

describe("every account page's held layout", () => {
    const SHAPES: [AccountLoadingShape, string][] = [
        ["home", "Loading your account"],
        ["list", "Loading"],
        ["one", "Loading"],
        ["details", "Loading your details"],
        ["messages", "Loading your messages"],
    ];

    it.each(SHAPES)(
        "%s says it is loading, once, and draws no words that could be wrong",
        (shape, label) => {
            const { container } = render(<AccountLoading shape={shape} />);
            const held = screen.getByRole("status");
            expect(held).toHaveAttribute("aria-busy", "true");
            expect(held).toHaveTextContent(label);
            // The bars are decoration: nothing else is read out, and
            // nothing reads as "none" or as a failure.
            expect(held.textContent).toBe(label);
            expect(
                container.querySelectorAll("[aria-hidden='true']").length,
            ).toBeGreaterThan(0);
            expect(screen.queryByRole("alert")).toBeNull();
            expect(screen.queryByRole("heading")).toBeNull();
            expect(screen.queryByRole("button")).toBeNull();
        },
    );

    it("names what is loading where the page says", () => {
        render(<AccountLoading shape="list" label="Loading your orders" />);
        expect(screen.getByRole("status")).toHaveTextContent(
            "Loading your orders",
        );
    });

    it("holds still for someone who asked for less motion, and Home keeps its two columns", () => {
        const { container } = render(<AccountLoading shape="home" />);
        const grid = container.querySelector("[role='status'] > div");
        expect(grid?.className).toMatch(/motion-reduce:animate-none/);
        expect(grid?.className).toMatch(/\bmd:grid-cols-2\b/);
        expect(grid?.children).toHaveLength(4);
    });
});
