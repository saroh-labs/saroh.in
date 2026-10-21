// The customer-notice registry (DEC-174, U2 #1133): every kind the
// `customer.notify` job can carry has a file that says what it is, and
// every switch a notice names is one of U1's.
import type { NoticeVars } from ".";
import {
    backLink,
    noticeDefinition,
    NOTICES,
    noticeSentence,
    renderNotice,
    secretLinkLead,
    withLink,
} from ".";
import {
    NOTICE_KINDS,
    NOTICE_SENDS,
} from "../../communications/notice-settings";
import {
    NOTICE_TEMPLATES,
    SECRET_LINK_SLOT,
} from "../../communications/transactional";
import type {
    MembershipNoticeKind,
    MembershipNoticeVars,
    MembershipVariant,
} from "./membership";
import { MEMBERSHIP_NOTICE_KINDS } from "./membership";

const AT = new Date("2026-10-06T05:30:00.000Z");

/** One notice of every kind, with values a person typed. */
const SAMPLES: Record<(typeof NOTICE_TEMPLATES)[number], NoticeVars> = {
    BACK_IN_STOCK: {
        kind: "BACK_IN_STOCK",
        stock: {
            business: "Rye <&> Co.",
            product: "Linen <shirt> (Blue / M)",
            link: "https://rye.saroh.app/shop/linen-shirt",
            site: "https://rye.saroh.app",
        },
    },
    BACK_IN_STOCK_WAITING: {
        kind: "BACK_IN_STOCK_WAITING",
        stock: {
            business: "Rye <&> Co.",
            product: "Linen <shirt> (Blue / M)",
            link: "https://rye.saroh.app/shop/linen-shirt",
            site: "https://rye.saroh.app",
        },
    },
    BOOKING_CONFIRMED: {
        kind: "BOOKING_CONFIRMED",
        booking: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            service: "Check-up",
            staff: null,
            startAt: AT,
            fromStartAt: null,
            timeZone: "Asia/Kolkata",
            byCustomer: false,
        },
    },
    BOOKING_MOVED: {
        kind: "BOOKING_MOVED",
        booking: {
            business: "Rye <&> Co.",
            firstName: null,
            service: "Check-up",
            staff: "Meera",
            startAt: AT,
            fromStartAt: AT,
            timeZone: "Asia/Kolkata",
            byCustomer: false,
        },
    },
    BOOKING_CANCELLED: {
        kind: "BOOKING_CANCELLED",
        booking: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            service: "Check-up",
            staff: null,
            startAt: AT,
            fromStartAt: null,
            timeZone: "Asia/Kolkata",
            byCustomer: true,
        },
    },
    BOOKING_LAPSED: {
        kind: "BOOKING_LAPSED",
        booking: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            service: "Haircut",
            staff: null,
            startAt: AT,
            fromStartAt: null,
            timeZone: "Asia/Kolkata",
            byCustomer: false,
        },
    },
    ENQUIRY_RECEIVED: {
        kind: "ENQUIRY_RECEIVED",
        enquiry: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            message: "Do you <b>open</b> on Sundays?",
        },
    },
    ORDER_PLACED: {
        kind: "ORDER_PLACED",
        placed: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            number: "ORD-1019",
            fulfilment: "PICKUP",
            payOnHandover: true,
        },
    },
    ORDER_READY: {
        kind: "ORDER_READY",
        order: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            number: "ORD-1019",
            stage: "READY",
            pickup: true,
            courier: null,
            trackingNumber: null,
            trackingUrl: null,
        },
    },
    ORDER_HANDED_OVER: {
        kind: "ORDER_HANDED_OVER",
        order: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            number: "ORD-1019",
            stage: "HANDED_TO_COURIER",
            pickup: false,
            courier: "Bluedart",
            trackingNumber: "BD123",
            trackingUrl: "https://track.example.com/BD123",
        },
    },
    ORDER_DELIVERED: {
        kind: "ORDER_DELIVERED",
        delivery: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            number: "ORD-1019",
            courier: null,
            trackingNumber: null,
            trackingUrl: null,
        },
    },
    ORDER_SENT: {
        kind: "ORDER_SENT",
        delivery: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            number: "ORD-1019",
            courier: null,
            trackingNumber: null,
            trackingUrl: null,
        },
    },
    ORDER_TRACKING: {
        kind: "ORDER_TRACKING",
        delivery: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            number: "ORD-1019",
            courier: "Bluedart",
            trackingNumber: "BD<123>",
            trackingUrl: "https://track.example.com/BD123",
        },
    },
    ...membershipSamples(),
    MEMBERSHIP_ENDING: {
        kind: "MEMBERSHIP_ENDING",
        ending: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            plan: "Monthly",
            endsAt: AT,
            timeZone: "Asia/Kolkata",
            link: null,
        },
    },
    REFUND_SENT: {
        kind: "REFUND_SENT",
        refund: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            amountCents: 50000,
            currency: "INR",
            about: "your order ORD-1019",
            method: null,
        },
    },
    THREAD_REPLY: {
        kind: "THREAD_REPLY",
        reply: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            replies: ["Yes, we <b>open</b> at 9."],
            link: null,
        },
    },
    WAITLIST_OFFER: {
        kind: "WAITLIST_OFFER",
        waitlist: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            service: "Yoga",
            startAt: AT,
            heldUntil: AT,
            timeZone: "Asia/Kolkata",
        },
    },
    // Courses and classes (U17, #1148).
    COURSE_ENROLLED: {
        kind: "COURSE_ENROLLED",
        course: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            course: "Beginners' wheel",
            sessions: [AT, AT],
            timeZone: "Asia/Kolkata",
            online: false,
            money: null,
        },
    },
    COURSE_CANCELLED: {
        kind: "COURSE_CANCELLED",
        course: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            course: "Beginners' wheel",
            sessions: [AT],
            timeZone: "Asia/Kolkata",
            online: false,
            money: { state: "PAID", amountMinor: 800000, currency: "INR" },
        },
    },
    WAITLIST_CLASS_CANCELLED: {
        kind: "WAITLIST_CLASS_CANCELLED",
        waitlist: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            service: "Yoga",
            startAt: AT,
            timeZone: "Asia/Kolkata",
        },
    },
    AUTOPAY_FAILED: {
        kind: "AUTOPAY_FAILED",
        autopay: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            plan: "Monthly yoga",
            amount: "₹1,200.00",
            payOnline: true,
        },
    },
    PACK_LOW: {
        kind: "PACK_LOW",
        pack: {
            business: "Rye <&> Co.",
            firstName: "Asha",
            pack: "10-class <pack>",
            left: 1,
            unit: "class",
            expiresAt: AT,
            timeZone: "Asia/Kolkata",
        },
    },
    PACK_EXPIRING: {
        kind: "PACK_EXPIRING",
        pack: {
            business: "Rye <&> Co.",
            firstName: null,
            pack: "10-class <pack>",
            left: 3,
            unit: "class",
            expiresAt: AT,
            timeZone: "Asia/Kolkata",
        },
    },
};

/** One membership notice of each kind (U11). */
function membershipSamples(): Record<MembershipNoticeKind, NoticeVars> {
    const membership: MembershipNoticeVars = {
        business: "Rye <&> Co.",
        firstName: "Asha",
        variant: "JOINED",
        plan: "Monthly",
        toPlan: null,
        priceMinor: 120000,
        currency: "INR",
        interval: "MONTH",
        classes: 8,
        on: AT,
        timeZone: "Asia/Kolkata",
    };
    const variant: Record<MembershipNoticeKind, MembershipVariant> = {
        MEMBERSHIP_JOINED: "JOINED",
        MEMBERSHIP_PAUSED: "PAUSED",
        MEMBERSHIP_RESUMED: "RESUMED",
        MEMBERSHIP_PLAN_CHANGED: "PLAN_CHANGED",
        MEMBERSHIP_CANCELLED: "CANCELS_AT_END",
        MEMBERSHIP_KEPT: "KEPT",
    };
    return Object.fromEntries(
        MEMBERSHIP_NOTICE_KINDS.map((kind) => [
            kind,
            { kind, membership: { ...membership, variant: variant[kind] } },
        ]),
    ) as Record<MembershipNoticeKind, NoticeVars>;
}

describe("the notice registry", () => {
    it("every NOTICE_TEMPLATES kind has an entry, and nothing else does", () => {
        expect(Object.keys(NOTICES).sort()).toEqual(
            [...NOTICE_TEMPLATES].sort(),
        );
    });

    it("every entry's switch is one of U1's kinds, or none", () => {
        for (const kind of NOTICE_TEMPLATES) {
            const setting = noticeDefinition(kind).setting;
            if (setting !== null) expect(NOTICE_KINDS).toContain(setting);
        }
    });

    it("every kind has its words: a sentence, a subject line and an email with everything typed escaped", () => {
        for (const kind of NOTICE_TEMPLATES) {
            const vars = SAMPLES[kind];
            expect(vars.kind).toBe(kind);
            expect(noticeSentence(vars).length).toBeGreaterThan(0);
            const email = renderNotice(vars);
            expect(email.subject.length).toBeGreaterThan(0);
            expect(email.body).toContain("Rye &lt;&amp;&gt; Co.");
            expect(email.body).not.toContain("<&>");
        }
    });

    it("the handover carries its tracking link before the way back", () => {
        const body = renderNotice(SAMPLES.ORDER_HANDED_OVER).body;
        expect(body).toContain("Track it here:");
        expect(body).toContain("https://track.example.com/BD123");
    });

    it("the way back only on the kinds that have one, and only a web address", () => {
        const placed = withLink(
            SAMPLES.ORDER_PLACED,
            "https://rye.saroh.app/shop/order/o",
        );
        expect(backLink(placed)).toEqual({
            lead: "See your order:",
            url: "https://rye.saroh.app/shop/order/o",
        });
        expect(
            backLink(withLink(SAMPLES.ORDER_PLACED, "javascript:alert(1)")),
        ).toBeNull();
        // A cancelled booking, a step, a waitlist offer, a class called
        // off and a course's notices have none.
        for (const kind of [
            "BOOKING_CANCELLED",
            "ORDER_READY",
            "WAITLIST_OFFER",
            "WAITLIST_CLASS_CANCELLED",
            "COURSE_ENROLLED",
            "COURSE_CANCELLED",
            "PACK_LOW",
            "PACK_EXPIRING",
        ] as const) {
            const vars = withLink(SAMPLES[kind], "https://rye.saroh.app/x");
            expect(backLink(vars)).toBeNull();
        }
        expect(withLink(SAMPLES.ORDER_PLACED, null)).toBe(SAMPLES.ORDER_PLACED);
    });

    it("back in stock links the product, names the option and says it is the last email (U23)", () => {
        const email = renderNotice(SAMPLES.BACK_IN_STOCK);
        expect(email.subject).toBe(
            "Linen <shirt> (Blue / M) is back at Rye <&> Co.",
        );
        expect(email.body).toContain("Linen &lt;shirt&gt; (Blue / M) is back");
        expect(email.body).toContain("last email you&#39;ll get about it");
        expect(email.body).toContain("See it here:");
        expect(email.body).toContain("https://rye.saroh.app/shop/linen-shirt");
        // No product page now: no link, still the email.
        const bare = renderNotice({
            kind: "BACK_IN_STOCK",
            stock: { ...SAMPLES.BACK_IN_STOCK.stock, link: null },
        } as NoticeVars);
        expect(bare.body).not.toContain("See it here:");
        expect(bare.body).not.toContain("Hi ");
    });

    it("the sign-up email carries Stop waiting as a slot, never the token; the back-in-stock email has none (DEC-178)", () => {
        const kind = "BACK_IN_STOCK_WAITING";
        const body = renderNotice(SAMPLES[kind]).body;
        expect(body).toContain(
            `Changed your mind? Stop waiting here:<br><a href="${SECRET_LINK_SLOT}">${SECRET_LINK_SLOT}</a>`,
        );
        expect(body).not.toContain("stop-waiting");
        expect(secretLinkLead(SAMPLES[kind])).toBe(
            "Changed your mind? Stop waiting here:",
        );
        // No site to stop on now: no slot, so the send needs no link.
        const bare = {
            kind,
            stock: { ...SAMPLES[kind].stock, site: null, link: null },
        } as NoticeVars;
        expect(secretLinkLead(bare)).toBeNull();
        expect(renderNotice(bare).body).not.toContain(SECRET_LINK_SLOT);
        // The back-in-stock email: the watch is told, nothing to stop.
        const told = renderNotice(SAMPLES.BACK_IN_STOCK).body;
        expect(told).not.toContain("Stop waiting");
        expect(told).not.toContain(SECRET_LINK_SLOT);
        expect(secretLinkLead(SAMPLES.BACK_IN_STOCK)).toBeNull();
    });

    it("the sign-up email says it once, plainly, with no product link (DEC-178)", () => {
        const vars = SAMPLES.BACK_IN_STOCK_WAITING;
        const email = renderNotice(vars);
        expect(email.subject).toBe(
            "We'll email you when Linen <shirt> (Blue / M) is back",
        );
        expect(noticeSentence(vars)).toBe(
            "You asked Rye <&> Co. to tell you when Linen <shirt> (Blue / M) is back. We'll email you once when it is, and that's all.",
        );
        expect(email.body).not.toContain("See it here:");
        expect(email.body).not.toContain("Hi ");
        // Every other kind with no secret link has no slot either.
        expect(secretLinkLead(SAMPLES.ORDER_PLACED)).toBeNull();
    });

    it("a load for another kind's payload reads nothing", async () => {
        const tx = {} as never;
        await expect(
            noticeDefinition("ORDER_READY").load(
                tx,
                "org_1",
                { kind: "WAITLIST_OFFER", eventKey: "x" },
                AT,
            ),
        ).resolves.toBeNull();
    });
});

describe("a notice with a switch is offered on the switches screen (U4)", () => {
    it("every switch a registered notice names is marked as sent (NOTICE_SENDS)", () => {
        for (const kind of NOTICE_TEMPLATES) {
            const setting = noticeDefinition(kind).setting;
            if (setting !== null) expect(NOTICE_SENDS[setting]).toBe(true);
        }
    });
});

describe("a failed autopay charge's notice (U10)", () => {
    it("says what couldn't be taken, and carries its pay link as a slot, never a link of its own", () => {
        const vars = SAMPLES.AUTOPAY_FAILED;
        expect(noticeSentence(vars)).toBe(
            "We couldn't take ₹1,200.00 for Monthly yoga by autopay.",
        );
        const email = renderNotice(vars);
        expect(email.subject).toBe(
            "We couldn't take your payment for Monthly yoga",
        );
        expect(email.body).toContain(
            `Pay it by UPI or card here:<br><a href="${SECRET_LINK_SLOT}">${SECRET_LINK_SLOT}</a>`,
        );
        expect(backLink(withLink(vars, "https://rye.saroh.app/x"))).toBeNull();
    });

    it("a business that doesn't take payment online sends a link to see how to pay", () => {
        const vars = {
            ...SAMPLES.AUTOPAY_FAILED,
            autopay: {
                ...(SAMPLES.AUTOPAY_FAILED as { autopay: object }).autopay,
                payOnline: false,
            },
        } as NoticeVars;
        expect(renderNotice(vars).body).toContain(
            "See the invoice and how to pay it here:",
        );
    });
});
