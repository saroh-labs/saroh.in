import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingsApi } from "./bookings-api";
import { AccountBookingsTab } from "./bookings-list";
import type {
    AccountBookingRow,
    AccountBookings,
    AccountCancelTerms,
    AccountTreatment,
    AccountTreatmentVisit,
} from "./bookings-model";
import {
    bookingSub,
    cancelledText,
    cancelNote,
    moveClassHref,
    movedText,
    treatmentLead,
    treatmentVisitWords,
} from "./bookings-model";
import { MoveClass } from "./move-class";

/**
 * The account's Bookings tab in jsdom (round-2 plan A, A6): the three lists
 * and their buttons, the Move sheet reading free times and moving, the
 * late booking's "Call", the Cancel sheet saying what will happen, a
 * treatment's visits and "Book visit N", and a class moved on the booking
 * page. The look is the browser pass's; this pins the words and the calls.
 */

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/account/bookings",
}));

beforeEach(() => {
    router.push.mockReset();
    router.refresh.mockReset();
    router.replace.mockReset();
});

const CHECK_UP_TERMS: AccountCancelTerms = {
    late: false,
    freeUntil: "2026-10-04T04:30:00.000Z",
    money: "refund",
    credit: null,
};

const LATE_TERMS: AccountCancelTerms = {
    late: true,
    freeUntil: "2026-10-04T04:30:00.000Z",
    money: "kept-late",
    credit: null,
};

const CHECK_UP: AccountBookingRow = {
    ref: "bk_1",
    service: "Check-up",
    serviceRef: "svc_1",
    startAt: "2026-10-05T04:30:00.000Z",
    endAt: "2026-10-05T05:30:00.000Z",
    timezone: "Asia/Kolkata",
    staff: "Dr. Rao",
    online: false,
    state: "booked",
    kind: "one",
    visit: null,
    cancelledLate: false,
    move: "sheet",
    cancel: CHECK_UP_TERMS,
};

const YOGA: AccountBookingRow = {
    ...CHECK_UP,
    ref: "bk_2",
    service: "Morning yoga",
    serviceRef: "svc_2",
    staff: null,
    kind: "class",
    move: "page",
    cancel: { late: false, freeUntil: null, money: "none", credit: "back" },
};

const LATE: AccountBookingRow = {
    ...CHECK_UP,
    ref: "bk_3",
    startAt: "2026-10-03T04:30:00.000Z",
    endAt: "2026-10-03T05:30:00.000Z",
    move: "call",
    cancel: LATE_TERMS,
};

const DONE: AccountBookingRow = {
    ...CHECK_UP,
    ref: "bk_0",
    startAt: "2026-09-20T04:30:00.000Z",
    state: "attended",
    move: null,
    cancel: null,
};

const VISIT_1: AccountTreatmentVisit = {
    number: 1,
    ref: "bk_v1",
    startAt: "2026-09-20T04:30:00.000Z",
    timezone: "Asia/Kolkata",
    staff: "Dr. Mehta",
    online: false,
    state: "done",
};

const VISIT_2: AccountTreatmentVisit = {
    number: 2,
    ref: null,
    startAt: null,
    timezone: null,
    staff: null,
    online: null,
    state: "to-book",
};

const VISIT_3: AccountTreatmentVisit = { ...VISIT_2, number: 3 };

const ROOT_CANAL: AccountTreatment = {
    ref: "ord_1",
    name: "Root canal",
    total: "9000.00",
    currency: "INR",
    paid: true,
    done: 1,
    bookNext: 2,
    visits: [VISIT_1, VISIT_2, VISIT_3],
};

function lists(over: Partial<AccountBookings> = {}): AccountBookings {
    return {
        comingUp: [CHECK_UP, YOGA, LATE],
        past: [DONE],
        cancelled: [],
        treatments: [],
        ...over,
    };
}

function api(over: Partial<BookingsApi> = {}): BookingsApi {
    return {
        moveTimes: vi.fn().mockResolvedValue({
            ok: true,
            times: {
                service: "Check-up",
                staff: "Dr. Rao",
                timezone: "Asia/Kolkata",
                times: ["2026-10-06T05:30:00.000Z", "2026-10-06T06:30:00.000Z"],
            },
        }),
        move: vi.fn().mockResolvedValue({ ok: true, booking: CHECK_UP }),
        cancel: vi.fn().mockResolvedValue({
            ok: true,
            result: {
                booking: { ...CHECK_UP, state: "cancelled" },
                refund: {
                    amount: "400.00",
                    currency: "INR",
                    status: "CONFIRMING",
                },
                kept: null,
                order: false,
            },
        }),
        visitTimes: vi.fn().mockResolvedValue({
            ok: true,
            times: {
                service: "Root canal",
                staff: "Dr. Mehta",
                timezone: "Asia/Kolkata",
                times: ["2026-10-08T05:30:00.000Z"],
            },
        }),
        bookVisit: vi
            .fn()
            .mockResolvedValue({ ok: true, treatment: ROOT_CANAL }),
        ...over,
    };
}

function draw(
    bookings: AccountBookings = lists(),
    calls: BookingsApi = api(),
    initial: { kind: "move" | "cancel"; ref: string } | null = null,
) {
    render(
        <AccountBookingsTab
            bookings={{ ok: true, value: bookings }}
            businessName="Kavi Dental"
            phone="+91 98765 43210"
            api={calls}
            initial={initial}
        />,
    );
    return calls;
}

describe("the Bookings tab (A6)", () => {
    it("lists Coming up with Move and Cancel, Past without, and no Cancelled card when there are none", () => {
        draw();
        // The tab's title is the account header's (DEC-073 #10), not the tab's.
        expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
        const up = screen.getByRole("region", { name: "Coming up" });
        expect(within(up).getByText("3")).toBeInTheDocument();
        expect(
            within(up).getByText("Check-up · Mon 5 Oct, 10:00"),
        ).toBeTruthy();
        expect(
            within(up).getByRole("link", { name: "Book another" }),
        ).toHaveAttribute("href", "/book");
        // A class moves on the booking page.
        expect(
            within(up).getByRole("link", {
                name: "Move Morning yoga · Mon 5 Oct, 10:00",
            }),
        ).toHaveAttribute("href", moveClassHref("bk_2"));
        const past = screen.getByRole("region", { name: "Past" });
        expect(within(past).getByText("Attended")).toBeInTheDocument();
        expect(within(past).queryByRole("button")).toBeNull();
        expect(screen.queryByRole("heading", { name: "Cancelled" })).toBeNull();
    });

    it("says so when nothing is booked, and when the lists couldn't be read", () => {
        draw(lists({ comingUp: [], past: [] }));
        expect(screen.getByText("Nothing booked.")).toBeInTheDocument();
        expect(screen.getByText("Nothing yet.")).toBeInTheDocument();
    });

    it("a failed read says so and never reads as nothing booked", () => {
        render(
            <AccountBookingsTab
                bookings={{ ok: false }}
                businessName="Pulse"
                phone={null}
                api={api()}
            />,
        );
        expect(
            screen.getByText(
                "Your bookings couldn't be loaded. Refresh the page to try again.",
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText("Nothing booked.")).toBeNull();
    });

    it("Move reads free times with the same person, and moves to the one picked", async () => {
        const calls = draw();
        fireEvent.click(
            screen.getByRole("button", {
                name: "Move Check-up · Mon 5 Oct, 10:00",
            }),
        );
        const sheet = await screen.findByRole("dialog");
        expect(within(sheet).getByText("Move Check-up")).toBeInTheDocument();
        expect(
            within(sheet).getByText("Same service, with Dr. Rao."),
        ).toBeInTheDocument();
        expect(calls.moveTimes).toHaveBeenCalledWith("bk_1");
        const go = within(sheet).getByRole("button", { name: "Pick a time" });
        expect(go).toBeDisabled();
        fireEvent.click(
            await within(sheet).findByRole("radio", {
                name: /Tue 6 Oct at 11:00/,
            }),
        );
        fireEvent.click(
            within(sheet).getByRole("button", {
                name: "Move to Tue 6 Oct at 11:00",
            }),
        );
        await waitFor(() =>
            expect(calls.move).toHaveBeenCalledWith(
                "bk_1",
                "2026-10-06T05:30:00.000Z",
            ),
        );
        expect(
            await screen.findByText("Moved to Tue 6 Oct at 11:00."),
        ).toBeInTheDocument();
        expect(router.refresh).toHaveBeenCalled();
    });

    it("once the business is told of a move (A14), it says so", async () => {
        const calls = draw(
            lists(),
            api({
                move: vi.fn().mockResolvedValue({
                    ok: true,
                    booking: CHECK_UP,
                    told: true,
                }),
            }),
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: "Move Check-up · Mon 5 Oct, 10:00",
            }),
        );
        const sheet = await screen.findByRole("dialog");
        fireEvent.click(
            await within(sheet).findByRole("radio", {
                name: /Tue 6 Oct at 11:00/,
            }),
        );
        fireEvent.click(
            within(sheet).getByRole("button", {
                name: "Move to Tue 6 Oct at 11:00",
            }),
        );
        await waitFor(() => expect(calls.move).toHaveBeenCalled());
        expect(
            await screen.findByText(
                "Moved to Tue 6 Oct at 11:00. Kavi Dental has been told.",
            ),
        ).toBeInTheDocument();
    });

    it("once the team is told of a cancel (A14), it says so", async () => {
        draw(
            lists(),
            api({
                cancel: vi.fn().mockResolvedValue({
                    ok: true,
                    result: {
                        booking: { ...CHECK_UP, state: "cancelled" },
                        refund: null,
                        kept: null,
                        order: false,
                        told: true,
                    },
                }),
            }),
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: "Cancel Check-up · Mon 5 Oct, 10:00",
            }),
        );
        const sheet = await screen.findByRole("dialog");
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Yes, cancel it" }),
        );
        expect(
            await screen.findByText("Cancelled. The team has been told."),
        ).toBeInTheDocument();
    });

    it("with no free times, Move points to Messages", async () => {
        draw(
            lists(),
            api({
                moveTimes: vi.fn().mockResolvedValue({
                    ok: true,
                    times: {
                        service: "Check-up",
                        staff: "Dr. Rao",
                        timezone: "Asia/Kolkata",
                        times: [],
                    },
                }),
            }),
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: "Move Check-up · Mon 5 Oct, 10:00",
            }),
        );
        const sheet = await screen.findByRole("dialog");
        const link = await within(sheet).findByRole("link", {
            name: "Send a message",
        });
        expect(link).toHaveAttribute("href", "/account/messages");
        expect(
            within(sheet).getByText(/and Kavi Dental will fit you in\./),
        ).toBeInTheDocument();
    });

    it("a time that just went is said, and the times are read again", async () => {
        const calls = draw(
            lists(),
            api({
                move: vi.fn().mockResolvedValue({
                    ok: false,
                    message: "That time just went. Pick another one.",
                }),
            }),
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: "Move Check-up · Mon 5 Oct, 10:00",
            }),
        );
        const sheet = await screen.findByRole("dialog");
        fireEvent.click(
            await within(sheet).findByRole("radio", {
                name: /Tue 6 Oct at 11:00/,
            }),
        );
        fireEvent.click(
            within(sheet).getByRole("button", { name: /^Move to/ }),
        );
        expect(
            await within(sheet).findByText(
                "That time just went. Pick another one.",
            ),
        ).toBeInTheDocument();
        await waitFor(() => expect(calls.moveTimes).toHaveBeenCalledTimes(2));
    });

    it("inside the late window, Move says to call the business, with its number", async () => {
        draw();
        fireEvent.click(
            screen.getByRole("button", {
                name: "Move Check-up · Sat 3 Oct, 10:00",
            }),
        );
        const sheet = await screen.findByRole("dialog");
        expect(
            within(sheet).getByText(
                "It's too close to the time to move it here. Call Kavi Dental to change this.",
            ),
        ).toBeInTheDocument();
        expect(
            within(sheet).getByRole("link", { name: "Call +91 98765 43210" }),
        ).toHaveAttribute("href", "tel:+919876543210");
    });

    it("Cancel says what will happen, cancels, and says what happened to the money", async () => {
        const calls = draw();
        fireEvent.click(
            screen.getByRole("button", {
                name: "Cancel Check-up · Mon 5 Oct, 10:00",
            }),
        );
        const sheet = await screen.findByRole("dialog");
        expect(
            within(sheet).getByText("Cancel this booking?"),
        ).toBeInTheDocument();
        expect(
            within(sheet).getByText(
                "Free to cancel until Sun 4 Oct, 10:00. What you paid online is refunded.",
            ),
        ).toBeInTheDocument();
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Yes, cancel it" }),
        );
        await waitFor(() => expect(calls.cancel).toHaveBeenCalledWith("bk_1"));
        expect(
            await screen.findByText(
                "Cancelled. ₹400 is being refunded to the way you paid.",
            ),
        ).toBeInTheDocument();
    });

    it("Keep it closes the sheet without cancelling", async () => {
        const calls = draw();
        fireEvent.click(
            screen.getByRole("button", {
                name: "Cancel Check-up · Mon 5 Oct, 10:00",
            }),
        );
        const sheet = await screen.findByRole("dialog");
        fireEvent.click(within(sheet).getByRole("button", { name: "Keep it" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(calls.cancel).not.toHaveBeenCalled();
    });

    it("opens a sheet asked for from Home, and sends a class's Move to the booking page", async () => {
        draw(lists(), api(), { kind: "cancel", ref: "bk_1" });
        expect(await screen.findByRole("dialog")).toHaveTextContent(
            "Cancel this booking?",
        );
    });

    it("a class asked to move from Home goes to the booking page", () => {
        draw(lists(), api(), { kind: "move", ref: "bk_2" });
        expect(router.push).toHaveBeenCalledWith("/book?move=bk_2");
    });

    it("a treatment lists its visits and books the next one", async () => {
        const calls = draw(lists({ treatments: [ROOT_CANAL] }));
        const card = screen.getByRole("region", { name: "Root canal" });
        expect(within(card).getByText("1 of 3 visits done")).toBeTruthy();
        expect(
            within(card).getByText(
                "Paid ₹9,000 for the whole treatment. Each visit is booked when the one before is done.",
            ),
        ).toBeTruthy();
        expect(within(card).getByText("Ready to book.")).toBeTruthy();
        expect(
            within(card).queryByRole("button", { name: "Book visit 3" }),
        ).toBeNull();
        fireEvent.click(
            within(card).getByRole("button", { name: "Book visit 2" }),
        );
        const sheet = await screen.findByRole("dialog");
        expect(
            within(sheet).getByText("Root canal, visit 2 of 3."),
        ).toBeInTheDocument();
        fireEvent.click(
            await within(sheet).findByRole("radio", {
                name: /Thu 8 Oct at 11:00/,
            }),
        );
        fireEvent.click(
            within(sheet).getByRole("button", {
                name: "Book Thu 8 Oct at 11:00",
            }),
        );
        await waitFor(() =>
            expect(calls.bookVisit).toHaveBeenCalledWith(
                "ord_1",
                "2026-10-08T05:30:00.000Z",
            ),
        );
        expect(
            await screen.findByText("Visit 2 booked for Thu 8 Oct at 11:00."),
        ).toBeInTheDocument();
    });
});

describe("the Bookings words (A6)", () => {
    it("a row's line: the visit, the person, a video call, a late cancel", () => {
        expect(
            bookingSub({
                ...CHECK_UP,
                visit: { number: 2, of: 3 },
                online: true,
                state: "cancelled",
                cancelledLate: true,
            }),
        ).toBe("Visit 2 of 3 · With Dr. Rao · Video call · Cancelled late");
    });

    it("the cancel sheet's note follows the terms, and never names a way to pay", () => {
        expect(cancelNote(LATE_TERMS, "Asia/Kolkata")).toBe(
            "It's past the free-cancellation time (Sun 4 Oct, 10:00). What you paid online is kept.",
        );
        expect(
            cancelNote(
                {
                    late: false,
                    freeUntil: null,
                    money: "kept-policy",
                    credit: "back",
                },
                "UTC",
            ),
        ).toBe(
            "Free to cancel. What you paid online isn't refunded automatically. Your class credit goes back.",
        );
        expect(
            cancelNote(
                { late: false, freeUntil: null, money: "order", credit: null },
                "UTC",
            ),
        ).toBe(
            "Free to cancel. Money for this treatment is refunded from its order.",
        );
        for (const text of [
            cancelNote(CHECK_UP_TERMS, "UTC"),
            cancelNote(LATE_TERMS, "UTC"),
        ]) {
            expect(text).not.toMatch(/UPI|card/i);
        }
    });

    it("what a cancel did: a refund that failed, and money kept", () => {
        expect(
            cancelledText({
                booking: CHECK_UP,
                refund: {
                    amount: "400.00",
                    currency: "INR",
                    status: "REFUSED",
                },
                kept: null,
                order: false,
            }),
        ).toBe(
            "Cancelled. The refund of ₹400 didn't go through. Contact the business about it.",
        );
        expect(
            cancelledText({
                booking: CHECK_UP,
                refund: null,
                kept: { amount: "400.00", currency: "INR" },
                order: false,
            }),
        ).toBe("Cancelled. The ₹400 you paid online is kept.");
    });

    it("says the team was told only when it was (A14)", () => {
        const base = {
            booking: CHECK_UP,
            refund: null,
            kept: null,
            order: false,
        };
        expect(cancelledText({ ...base, told: true })).toBe(
            "Cancelled. The team has been told.",
        );
        expect(cancelledText({ ...base, told: false })).toBe("Cancelled.");
        // An API before A14 says nothing about it.
        expect(cancelledText(base)).toBe("Cancelled.");
        expect(
            cancelledText({
                ...base,
                refund: { amount: "400.00", currency: "INR", status: "SENT" },
                told: true,
            }),
        ).toBe(
            "Cancelled. The team has been told. ₹400 is being refunded to the way you paid.",
        );
        expect(movedText("Tue 6 Oct at 11:00", "Kavi Dental", true)).toBe(
            "Moved to Tue 6 Oct at 11:00. Kavi Dental has been told.",
        );
        expect(movedText("Tue 6 Oct at 11:00", " ", true)).toBe(
            "Moved to Tue 6 Oct at 11:00. The team has been told.",
        );
        expect(movedText("Tue 6 Oct at 11:00", "Kavi Dental", false)).toBe(
            "Moved to Tue 6 Oct at 11:00.",
        );
    });

    it("a visit booked today says Today; a treatment all done has no lead", () => {
        const now = new Date("2026-10-08T03:00:00.000Z");
        const TODAY: AccountTreatmentVisit = {
            ...VISIT_1,
            number: 2,
            startAt: "2026-10-08T05:30:00.000Z",
            state: "booked",
        };
        const t: AccountTreatment = {
            ...ROOT_CANAL,
            bookNext: null,
            visits: [VISIT_1, TODAY, VISIT_3],
        };
        expect(treatmentVisitWords(TODAY, t, now)).toMatchObject({
            tag: "Today",
            today: true,
        });
        expect(treatmentVisitWords(VISIT_3, t, now).sub).toBe(
            "We'll plan this one with you at your next visit.",
        );
        expect(
            treatmentLead({
                ...ROOT_CANAL,
                done: 3,
            }),
        ).toBeNull();
    });
});

describe("moving a class on the booking page (A6)", () => {
    it("shows Moving: ‹class› and the other sessions, and moves to the one picked", async () => {
        const days = {
            timezone: "Asia/Kolkata",
            kind: "class",
            capacity: 12,
            days: [
                {
                    date: "2026-10-05",
                    open: true,
                    starts: [
                        {
                            startAt: YOGA.startAt,
                            endAt: YOGA.endAt,
                            staffId: null,
                            staffName: null,
                            placesLeft: 4,
                        },
                    ],
                },
                {
                    date: "2026-10-07",
                    open: true,
                    starts: [
                        {
                            startAt: "2026-10-07T01:30:00.000Z",
                            endAt: "2026-10-07T02:30:00.000Z",
                            staffId: null,
                            staffName: null,
                            placesLeft: 6,
                        },
                    ],
                },
            ],
        };
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                status: 200,
                json: () => Promise.resolve(days),
            }),
        );
        const move = vi.fn().mockResolvedValue({ ok: true, booking: YOGA });
        render(
            <MoveClass
                row={YOGA}
                apiUrl="https://api.example"
                businessName="Pulse"
                move={move}
            />,
        );
        expect(screen.getByText("Moving: Morning yoga")).toBeInTheDocument();
        const radios = await screen.findAllByRole("radio");
        // The session booked now is left out.
        expect(radios).toHaveLength(1);
        fireEvent.click(screen.getByRole("radio", { name: /7 Oct/ }));
        fireEvent.click(screen.getByRole("button", { name: "Move here" }));
        await waitFor(() =>
            expect(move).toHaveBeenCalledWith(
                "bk_2",
                "2026-10-07T01:30:00.000Z",
            ),
        );
        expect(
            await screen.findByText("Your place and its credit moved with it."),
        ).toBeInTheDocument();
        vi.unstubAllGlobals();
    });

    it("a booking that isn't a class to move here says why", () => {
        render(
            <MoveClass
                row={LATE}
                apiUrl="https://api.example"
                businessName="Pulse"
                move={vi.fn()}
            />,
        );
        expect(
            screen.getByText(
                "It's too close to the time. Call Pulse to change this.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Back to your bookings" }),
        ).toHaveAttribute("href", "/account/bookings");
    });
});
