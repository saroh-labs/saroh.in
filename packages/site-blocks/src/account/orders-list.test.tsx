import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountHome } from "./account-home";
import type {
    AccountOrder,
    AccountOrderDetail,
    AccountView,
    AccountHome as HomeData,
} from "./model";
import { orderLine, stepMark, visitLine } from "./model";
import { AccountOrders, trackHref } from "./orders-list";

/**
 * The account's Orders tab and Track in jsdom (round-2 plan A, A7): the
 * rows and their buttons, the sheet drawing the API's steps as they come,
 * a refund's line, a treatment's visits, and the failed and missing reads.
 * The look is the browser pass's; this pins the words and the links.
 */

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/account/orders",
}));

beforeEach(() => {
    router.replace.mockReset();
});

const READY: AccountOrder = {
    ref: "ord_1",
    number: "1019",
    placedAt: "2026-10-02T06:00:00.000Z",
    total: "450.00",
    currency: "INR",
    open: true,
    status: "Ready",
    fulfilment: "Pick-up",
    items: [{ name: "Sourdough", quantity: 2 }],
    moreItems: 0,
};

const COLLECTED: AccountOrder = {
    ...READY,
    ref: "ord_0",
    number: "1012",
    open: false,
    status: "Collected",
};

const DETAIL: AccountOrderDetail = {
    ref: "ord_1",
    number: "1019",
    placedAt: "2026-10-02T06:00:00.000Z",
    total: "450.00",
    currency: "INR",
    fulfilment: "Pick-up",
    state: "open",
    status: "Ready",
    lines: [{ name: "Sourdough", quantity: 2, kind: "product", visits: null }],
    steps: [
        {
            label: "New",
            state: "done",
            line: "Done",
            at: "2026-10-02T06:00:00.000Z",
        },
        { label: "Preparing", state: "done", line: "Done", at: null },
        {
            label: "Ready",
            state: "now",
            line: "Now · At the counter — show #1019",
            at: null,
        },
        { label: "Collected", state: "next", line: "Picked up", at: null },
    ],
    courier: null,
    refund: null,
    receipt: null,
};

function draw(
    track: Parameters<typeof AccountOrders>[0]["track"],
    extra: Partial<Parameters<typeof AccountOrders>[0]> = {},
) {
    return render(
        <AccountOrders
            orders={{ ok: true, value: [READY, COLLECTED] }}
            track={track}
            businessName="Rye & Co."
            shopHref={null}
            messagesHref={null}
            {...extra}
        />,
    );
}

describe("the words", () => {
    it("an order's line says when, how much and, on its way, how it leaves", () => {
        expect(orderLine(READY)).toBe("2 Oct 2026 · ₹450 · Pick-up");
        expect(orderLine(COLLECTED)).toBe("2 Oct 2026 · ₹450");
        expect([stepMark("done"), stepMark("now"), stepMark("next")]).toEqual([
            "✓",
            "●",
            "○",
        ]);
        expect(
            visitLine({
                number: 2,
                startAt: "2026-10-05T04:30:00.000Z",
                timezone: "Asia/Kolkata",
                state: "booked",
            }),
        ).toEqual({ title: "Visit 2 · Mon 5 Oct, 10:00", state: "Booked" });
        expect(
            visitLine({
                number: 3,
                startAt: null,
                timezone: null,
                state: "to-book",
            }),
        ).toEqual({ title: "Visit 3", state: "To book" });
    });
});

describe("Orders", () => {
    it("lists every order with its tag; one on its way has Track, a finished one Details", () => {
        draw(null);
        expect(screen.getByText("#1019 · 2 × Sourdough")).toBeInTheDocument();
        expect(screen.getByText("Ready")).toBeInTheDocument();
        expect(screen.getByText("Collected")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Track order #1019" }),
        ).toHaveAttribute("href", trackHref("ord_1"));
        expect(
            screen.getByRole("link", { name: "Details of order #1012" }),
        ).toHaveAttribute("href", "/account/orders?order=ord_0");
        // No shop link while the shop doesn't take orders.
        expect(
            screen.queryByRole("link", { name: "Go to the shop" }),
        ).toBeNull();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("offers the shop when it takes orders, and says so when there are none", () => {
        draw(null, {
            orders: { ok: true, value: [] },
            shopHref: "/shop",
        });
        expect(screen.getByText("No orders yet.")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Go to the shop" }),
        ).toHaveAttribute("href", "/shop");
    });

    it("a failed read says so and never reads as none", () => {
        draw(null, { orders: { ok: false } });
        expect(
            screen.getByText(/Orders couldn't be loaded/),
        ).toBeInTheDocument();
        expect(screen.queryByText("No orders yet.")).toBeNull();
    });
});

describe("Track", () => {
    it("draws the API's steps: done, now and next, each with its line", () => {
        draw({ ok: true, order: DETAIL });
        const sheet = screen.getByRole("dialog", { name: "Order #1019" });
        const steps = within(sheet).getAllByRole("listitem");
        expect(steps.map((s) => s.textContent)).toEqual([
            "✓ Done: New2 Oct 2026",
            "✓ Done: PreparingDone",
            "● Now: ReadyNow · At the counter — show #1019",
            "○ Next: CollectedPicked up",
        ]);
        expect(steps[2]).toHaveAttribute("aria-current", "step");
        expect(
            within(sheet).getByText("Pick-up · 2 × Sourdough"),
        ).toBeInTheDocument();
        // No promise of a text: Saroh sends none about orders.
        expect(sheet.textContent).not.toMatch(/SMS|text you/i);
        // Without Messages (A13), the sheet closes instead.
        fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
        expect(router.replace).toHaveBeenCalledWith("/account/orders", {
            scroll: false,
        });
    });

    it("a pick-up says where to collect it, and when it's open (UX-025)", () => {
        draw({
            ok: true,
            order: {
                ...DETAIL,
                collectFrom: {
                    address: "12 Hill Road, Bandra",
                    hours: "Mon–Sat 10:00–19:00, Sun closed",
                },
            },
        });
        const sheet = screen.getByRole("dialog", { name: "Order #1019" });
        expect(sheet).toHaveTextContent("Collect from 12 Hill Road, Bandra");
        expect(sheet).toHaveTextContent("Open Mon–Sat 10:00–19:00, Sun closed");
    });

    it("a shipment links to the courier's tracking; a receipt opens its paper", () => {
        draw({
            ok: true,
            order: {
                ...DETAIL,
                fulfilment: "Shipping",
                receipt: "inv_1",
                courier: {
                    name: "Delhivery",
                    trackingNumber: "DL12345",
                    trackingUrl: "https://track.example.in/DL12345",
                },
            },
        });
        expect(
            screen.getByRole("link", { name: "Track with Delhivery" }),
        ).toHaveAttribute("href", "https://track.example.in/DL12345");
        expect(
            screen.getByRole("link", { name: "See the receipt" }),
        ).toHaveAttribute("href", "/account/receipts/inv_1");
    });

    it("a refunded order says so and where the money goes", () => {
        draw({
            ok: true,
            order: {
                ...DETAIL,
                state: "refunded",
                status: "Refunded",
                refund: "Money back in 5–7 days",
                steps: [
                    {
                        label: "New",
                        state: "done",
                        line: "Done",
                        at: "2026-10-02T06:00:00.000Z",
                    },
                    {
                        label: "Refunded",
                        state: "done",
                        line: "Money back in 5–7 days",
                        at: null,
                    },
                ],
            },
        });
        const sheet = screen.getByRole("dialog");
        expect(
            within(sheet).getByText("Refunded · Pick-up · 2 × Sourdough"),
        ).toBeInTheDocument();
        expect(
            within(sheet).getByText("Money back in 5–7 days"),
        ).toBeInTheDocument();
        expect(
            within(sheet).getByText(
                "The refund goes back to the way you paid.",
            ),
        ).toBeInTheDocument();
    });

    it("a treatment shows the service and its visits, and Message when Messages exists", () => {
        draw(
            {
                ok: true,
                order: {
                    ...DETAIL,
                    fulfilment: "Booking, in person",
                    lines: [
                        {
                            name: "Root canal",
                            quantity: 1,
                            kind: "service",
                            visits: [
                                {
                                    number: 1,
                                    startAt: "2026-10-08T04:30:00.000Z",
                                    timezone: "Asia/Kolkata",
                                    state: "done",
                                },
                                {
                                    number: 2,
                                    startAt: null,
                                    timezone: null,
                                    state: "to-book",
                                },
                            ],
                        },
                    ],
                },
            },
            { messagesHref: "/account/messages" },
        );
        expect(screen.getByText("Root canal · visits")).toBeInTheDocument();
        expect(
            screen.getByText("Visit 1 · Thu 8 Oct, 10:00"),
        ).toBeInTheDocument();
        expect(screen.getByText("To book")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Message Rye & Co." }),
        ).toHaveAttribute("href", "/account/messages");
    });

    it("another customer's order, or a failed read, says so in the sheet", () => {
        const { unmount } = draw({ ok: false, reason: "missing" });
        expect(
            screen.getByText("We couldn't find that order in your account."),
        ).toBeInTheDocument();
        unmount();
        draw({ ok: false, reason: "unavailable" });
        expect(
            screen.getByText(/This order couldn't be loaded/),
        ).toBeInTheDocument();
    });
});

describe("Home's orders", () => {
    it("an order on its way has Track; a finished one has no button", () => {
        const account: AccountView = {
            name: "Farah Khan",
            email: "farah@example.in",
            phone: null,
            businessName: "Rye & Co.",
            tabs: [
                { key: "home", label: "Home" },
                { key: "orders", label: "Orders" },
                { key: "me", label: "Me" },
            ],
            offers: { appointments: false, orders: true, plans: false },
            bookingsLabel: "Appointments",
            healthNotes: false,
        };
        const home: HomeData = {
            nextBooking: null,
            classes: { ok: true, value: null },
            orders: { ok: true, value: [READY, COLLECTED] },
            plan: { ok: true, value: null },
        };
        render(<AccountHome account={account} home={home} />);
        expect(
            screen.getByRole("link", { name: "Track order #1019" }),
        ).toHaveAttribute("href", "/account/orders?order=ord_1");
        expect(
            screen.queryByRole("link", { name: "Details of order #1012" }),
        ).toBeNull();
    });
});
