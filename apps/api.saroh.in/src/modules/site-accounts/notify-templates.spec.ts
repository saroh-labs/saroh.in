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
        expect(noticeWhen(AT, "Asia/Kolkata")).toBe("Tue 6 Oct at 11:00");
        expect(noticeWhen(AT, "Europe/London")).toBe("Tue 6 Oct at 06:30");
        // A zone that doesn't exist falls back to the default, never throws.
        expect(noticeWhen(AT, "Not/AZone")).toBe("Tue 6 Oct at 11:00");
    });

    it("tells the customer a booking is confirmed, moved or cancelled", () => {
        expect(
            noticeSentence({ kind: "BOOKING_CONFIRMED", booking: booking() }),
        ).toBe("Your Check-up with Dr Kavi on Tue 6 Oct at 11:00 is booked.");
        expect(
            noticeSentence({
                kind: "BOOKING_MOVED",
                booking: booking({ fromStartAt: WAS }),
            }),
        ).toBe(
            "Your Check-up with Dr Kavi has moved to Tue 6 Oct at 11:00. It was Mon 5 Oct at 10:00.",
        );
        expect(
            noticeSentence({ kind: "BOOKING_CANCELLED", booking: booking() }),
        ).toBe("Your Check-up on Tue 6 Oct at 11:00 has been cancelled.");
    });

    it("words what the customer did themselves as theirs", () => {
        expect(
            noticeSentence({
                kind: "BOOKING_MOVED",
                booking: booking({ byCustomer: true, fromStartAt: WAS }),
            }),
        ).toBe("You moved your Check-up to Tue 6 Oct at 11:00.");
        expect(
            noticeSentence({
                kind: "BOOKING_CANCELLED",
                booking: booking({ byCustomer: true }),
            }),
        ).toBe("You cancelled your Check-up on Tue 6 Oct at 11:00.");
    });

    it("leaves out the person when the booking has none", () => {
        expect(
            noticeSentence({
                kind: "BOOKING_CONFIRMED",
                booking: booking({ staff: null }),
            }),
        ).toBe("Your Check-up on Tue 6 Oct at 11:00 is booked.");
    });

    it("tells an order's Ready by how it leaves, and its handover with the courier", () => {
        expect(noticeSentence({ kind: "ORDER_READY", order: order() })).toBe(
            "Your order ORD-1019 is ready to collect.",
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
            "A place opened in Spin on Tue 6 Oct at 11:00. It's held for you until Mon 5 Oct at 10:00.",
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
            "Your Check-up with Dr Kavi on Tue 6 Oct at 11:00 is booked.",
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
            "Your order ORD-1019 from Rye & Co. is ready to collect",
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
            body: "Now Tue 6 Oct at 11:00. It was Mon 5 Oct at 10:00.",
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
            body: "It was Tue 6 Oct at 11:00.",
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
            "We have your order ORD-1019. You pay when you collect it. We'll tell you when it's ready to collect.",
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
