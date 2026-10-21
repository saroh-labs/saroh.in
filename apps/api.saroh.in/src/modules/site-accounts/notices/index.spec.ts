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
    withLink,
} from ".";
import {
    NOTICE_KINDS,
    NOTICE_SENDS,
} from "../../communications/notice-settings";
import { NOTICE_TEMPLATES } from "../../communications/transactional";
import type {
    MembershipNoticeKind,
    MembershipNoticeVars,
    MembershipVariant,
} from "./membership";
import { MEMBERSHIP_NOTICE_KINDS } from "./membership";

const AT = new Date("2026-10-06T05:30:00.000Z");

/** One notice of every kind, with values a person typed. */
const SAMPLES: Record<(typeof NOTICE_TEMPLATES)[number], NoticeVars> = {
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
    ...membershipSamples(),
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
        // A cancelled booking, a step and a waitlist offer have none.
        for (const kind of [
            "BOOKING_CANCELLED",
            "ORDER_READY",
            "WAITLIST_OFFER",
        ] as const) {
            const vars = withLink(SAMPLES[kind], "https://rye.saroh.app/x");
            expect(backLink(vars)).toBeNull();
        }
        expect(withLink(SAMPLES.ORDER_PLACED, null)).toBe(SAMPLES.ORDER_PLACED);
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
