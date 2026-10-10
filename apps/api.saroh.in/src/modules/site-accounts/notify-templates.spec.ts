import type {
    BookingNoticeVars,
    NoticeVars,
    OrderNoticeVars,
} from "./notify-templates";
import {
    noticeSentence,
    noticeWhen,
    orderNoticeKind,
    renderNotice,
    teamNotice,
} from "./notify-templates";

// Tue 6 Oct 2026, 05:30 UTC = 11:00 in Kolkata.
const AT = new Date("2026-10-06T05:30:00.000Z");
const WAS = new Date("2026-10-05T04:30:00.000Z");

function booking(over: Partial<BookingNoticeVars> = {}): BookingNoticeVars {
    return {
        business: "Kavi Dental",
        firstName: "Asha",
        service: "Check-up",
        staff: "Dr Kavi",
        startAt: AT,
        fromStartAt: null,
        timeZone: "Asia/Kolkata",
        byCustomer: false,
        ...over,
    };
}

function order(over: Partial<OrderNoticeVars> = {}): OrderNoticeVars {
    return {
        business: "Rye & Co.",
        firstName: "Asha",
        number: "ORD-1019",
        stage: "READY",
        pickup: true,
        courier: null,
        trackingNumber: null,
        trackingUrl: null,
        ...over,
    };
}

describe("notice words (A14)", () => {
    it("says when in the business's zone", () => {
        expect(noticeWhen(AT, "Asia/Kolkata")).toBe("Tue 6 Oct at 11:00 am");
        expect(noticeWhen(AT, "Europe/London")).toBe("Tue 6 Oct at 6:30 am");
        // A zone that doesn't exist falls back to the default, never throws.
        expect(noticeWhen(AT, "Not/AZone")).toBe("Tue 6 Oct at 11:00 am");
    });

    it("tells the customer a booking is confirmed, moved or cancelled", () => {
        expect(
            noticeSentence({ kind: "BOOKING_CONFIRMED", booking: booking() }),
        ).toBe(
            "Your Check-up with Dr Kavi on Tue 6 Oct at 11:00 am is booked.",
        );
        expect(
            noticeSentence({
                kind: "BOOKING_MOVED",
                booking: booking({ fromStartAt: WAS }),
            }),
        ).toBe(
            "Your Check-up with Dr Kavi has moved to Tue 6 Oct at 11:00 am. It was Mon 5 Oct at 10:00 am.",
        );
        expect(
            noticeSentence({ kind: "BOOKING_CANCELLED", booking: booking() }),
        ).toBe("Your Check-up on Tue 6 Oct at 11:00 am has been cancelled.");
    });

    it("words what the customer did themselves as theirs", () => {
        expect(
            noticeSentence({
                kind: "BOOKING_MOVED",
                booking: booking({ byCustomer: true, fromStartAt: WAS }),
            }),
        ).toBe("You moved your Check-up to Tue 6 Oct at 11:00 am.");
        expect(
            noticeSentence({
                kind: "BOOKING_CANCELLED",
                booking: booking({ byCustomer: true }),
            }),
        ).toBe("You cancelled your Check-up on Tue 6 Oct at 11:00 am.");
    });

    it("leaves out the person when the booking has none", () => {
        expect(
            noticeSentence({
                kind: "BOOKING_CONFIRMED",
                booking: booking({ staff: null }),
            }),
        ).toBe("Your Check-up on Tue 6 Oct at 11:00 am is booked.");
    });

    it("tells an order's Ready by how it leaves, and its handover with the courier", () => {
        expect(noticeSentence({ kind: "ORDER_READY", order: order() })).toBe(
            "Your order ORD-1019 is ready for pick-up.",
        );
        expect(
            noticeSentence({
                kind: "ORDER_READY",
                order: order({ pickup: false }),
            }),
        ).toBe("Your order ORD-1019 is packed and ready to go.");
        expect(
            noticeSentence({
                kind: "ORDER_HANDED_OVER",
                order: order({
                    stage: "HANDED_TO_COURIER",
                    courier: "Delhivery",
                    trackingNumber: "AWB4411",
                }),
            }),
        ).toBe(
            "Your order ORD-1019 is on its way with Delhivery. Tracking number: AWB4411.",
        );
        expect(
            noticeSentence({
                kind: "ORDER_HANDED_OVER",
                order: order({ stage: "HANDED_TO_COURIER" }),
            }),
        ).toBe("Your order ORD-1019 is on its way.");
        expect(
            noticeSentence({
                kind: "ORDER_HANDED_OVER",
                order: order({ stage: "OUT_FOR_DELIVERY" }),
            }),
        ).toBe("Your order ORD-1019 is out for delivery.");
    });

    it("offers a waitlist place with how long it is held", () => {
        expect(
            noticeSentence({
                kind: "WAITLIST_OFFER",
                waitlist: {
                    business: "Pulse Fitness",
                    firstName: null,
                    service: "Spin",
                    startAt: AT,
                    heldUntil: WAS,
                    timeZone: "Asia/Kolkata",
                },
            }),
        ).toBe(
            "A place opened in Spin on Tue 6 Oct at 11:00 am. It's held for you until Mon 5 Oct at 10:00 am.",
        );
    });

    it("names which order steps are told", () => {
        expect(orderNoticeKind("READY")).toBe("ORDER_READY");
        expect(orderNoticeKind("HANDED_TO_COURIER")).toBe("ORDER_HANDED_OVER");
        expect(orderNoticeKind("OUT_FOR_DELIVERY")).toBe("ORDER_HANDED_OVER");
        for (const stage of [
            "NEW",
            "PREPARING",
            "COLLECTED",
            "DELIVERED",
            "SENT",
        ]) {
            expect(orderNoticeKind(stage)).toBeNull();
        }
    });
});

describe("the notice email (A14)", () => {
    it("has a subject naming the business, and greets by first name", () => {
        const mail = renderNotice({
            kind: "BOOKING_CONFIRMED",
            booking: booking(),
        });
        expect(mail.subject).toBe("You're booked with Kavi Dental");
        expect(mail.body).toContain("<p>Hi Asha,</p>");
        expect(mail.body).toContain(
            "Your Check-up with Dr Kavi on Tue 6 Oct at 11:00 am is booked.",
        );
        expect(mail.body).toContain("<p>Kavi Dental</p>");
    });

    it("says Hello without a name", () => {
        const mail = renderNotice({
            kind: "ORDER_READY",
            order: order({ firstName: null }),
        });
        expect(mail.body.startsWith("<p>Hello,</p>")).toBe(true);
        expect(mail.subject).toBe(
            "Your order ORD-1019 from Rye & Co. is ready for pick-up",
        );
    });

    it("escapes everything typed, in the body", () => {
        const vars: NoticeVars = {
            kind: "BOOKING_CANCELLED",
            booking: booking({
                business: "<b>Rye</b>",
                firstName: "<script>",
                service: 'Cut & "Style"',
            }),
        };
        const mail = renderNotice(vars);
        expect(mail.body).not.toContain("<script>");
        expect(mail.body).not.toContain("<b>");
        expect(mail.body).toContain("&lt;script&gt;");
        expect(mail.body).toContain("Cut &amp; &quot;Style&quot;");
    });

    it("carries the way back to the order, and to their bookings, when there is one", () => {
        const placed = renderNotice({
            kind: "ORDER_PLACED",
            placed: {
                business: "Rye & Co.",
                firstName: "Asha",
                number: "ORD-1019",
                fulfilment: "PICKUP",
                payOnHandover: false,
                link: "https://rye.saroh.app/shop/order/ord_1?a=1&b=2",
            },
        });
        expect(placed.body).toContain(
            '<p>See your order:<br><a href="https://rye.saroh.app/shop/order/ord_1?a=1&amp;b=2">https://rye.saroh.app/shop/order/ord_1?a=1&amp;b=2</a></p>',
        );
        const booked = renderNotice({
            kind: "BOOKING_CONFIRMED",
            booking: booking({
                link: "https://kavidental.example/account/bookings",
            }),
        });
        expect(booked.body).toContain(
            '<p>See, move or cancel your booking:<br><a href="https://kavidental.example/account/bookings">',
        );
    });

    it("has no link without one, for a cancelled booking, or for an address that isn't a web one", () => {
        expect(
            renderNotice({ kind: "BOOKING_CONFIRMED", booking: booking() })
                .body,
        ).not.toContain("<a ");
        expect(
            renderNotice({
                kind: "BOOKING_CANCELLED",
                booking: booking({
                    link: "https://kavidental.example/account/bookings",
                }),
            }).body,
        ).not.toContain("<a ");
        expect(
            renderNotice({
                kind: "BOOKING_CONFIRMED",
                booking: booking({ link: "javascript:alert(1)" }),
            }).body,
        ).not.toContain("javascript");
    });

    it("links a courier's tracking page only when it is a web address", () => {
        const withLink = renderNotice({
            kind: "ORDER_HANDED_OVER",
            order: order({
                stage: "HANDED_TO_COURIER",
                trackingUrl: "https://track.example/AWB4411?x=1&y=2",
            }),
        });
        expect(withLink.body).toContain(
            '<a href="https://track.example/AWB4411?x=1&amp;y=2">',
        );
        const script = renderNotice({
            kind: "ORDER_HANDED_OVER",
            order: order({
                stage: "HANDED_TO_COURIER",
                trackingUrl: "javascript:alert(1)",
            }),
        });
        expect(script.body).not.toContain("<a ");
        expect(script.body).not.toContain("javascript");
    });
});

describe("the team's inbox line (A14)", () => {
    it("says who moved or cancelled what, and when", () => {
        expect(
            teamNotice("BOOKING_MOVED", "Asha Rao", {
                service: "Check-up",
                startAt: AT,
                fromStartAt: WAS,
                timeZone: "Asia/Kolkata",
            }),
        ).toEqual({
            title: "Asha Rao moved their Check-up",
            body: "Now Tue 6 Oct at 11:00 am. It was Mon 5 Oct at 10:00 am.",
        });
        expect(
            teamNotice("BOOKING_CANCELLED", "Asha Rao", {
                service: "Check-up",
                startAt: AT,
                fromStartAt: null,
                timeZone: "Asia/Kolkata",
            }),
        ).toEqual({
            title: "Asha Rao cancelled their Check-up",
            body: "It was Tue 6 Oct at 11:00 am.",
        });
    });
});

describe("a website order placed (UX-042)", () => {
    const placed = (over: Record<string, unknown> = {}): NoticeVars => ({
        kind: "ORDER_PLACED",
        placed: {
            business: "Rye & Co.",
            firstName: "Asha",
            number: "ORD-1019",
            fulfilment: "PICKUP",
            payOnHandover: true,
            ...over,
        },
    });

    it("says it's in, how it's paid, and only the steps they will hear of", () => {
        expect(noticeSentence(placed())).toBe(
            "We have your order ORD-1019. You pay at pick-up. We'll tell you when it's ready for pick-up.",
        );
        expect(noticeSentence(placed({ fulfilment: "LOCAL_DELIVERY" }))).toBe(
            "We have your order ORD-1019. You pay when it's delivered. We'll tell you when it's on its way.",
        );
        expect(
            noticeSentence(
                placed({ payOnHandover: false, fulfilment: "SHIPPING" }),
            ),
        ).toBe(
            "We have your order ORD-1019, and it's paid. We'll tell you when it's on its way.",
        );
        // Nothing is promised for a step nobody is told about.
        expect(
            noticeSentence(
                placed({ payOnHandover: false, fulfilment: "DIGITAL" }),
            ),
        ).toBe("We have your order ORD-1019, and it's paid.");
    });

    it("emails in the business's voice, everything escaped", () => {
        const mail = renderNotice(placed({ business: "Rye <&> Co." }));
        expect(mail.subject).toBe("Your order ORD-1019 from Rye <&> Co.");
        expect(mail.body).toContain("<p>Hi Asha,</p>");
        expect(mail.body).toContain("<p>Rye &lt;&amp;&gt; Co.</p>");
    });
});
