// A member's membership emails (DEC-174 U11, #1142): the words say what
// happens to the money and the classes, in the membership's own zone.
// The reads and the queueing are `membership-notices.db.spec.ts`.
import { renderNotice } from ".";
import type { MembershipNoticeVars, MembershipVariant } from "./membership";
import {
    MEMBERSHIP_NOTICE_OF,
    membershipNotice,
    membershipNoticeKey,
    membershipSentence,
    priceWords,
} from "./membership";

// 31 Oct 2026, 7:00 pm UTC: already 1 Nov in Kolkata.
const LATE = new Date("2026-10-31T19:00:00.000Z");

function vars(
    variant: MembershipVariant,
    over: Partial<MembershipNoticeVars> = {},
): MembershipNoticeVars {
    return {
        business: "Rye Studio",
        firstName: "Asha",
        variant,
        plan: "Monthly",
        toPlan: null,
        priceMinor: 120050,
        currency: "INR",
        interval: "MONTH",
        classes: null,
        on: LATE,
        timeZone: "Asia/Kolkata",
        ...over,
    };
}

describe("membership notice words", () => {
    it("joining names the plan, the price and the next renewal, in the business's zone", () => {
        expect(membershipSentence(vars("JOINED", { classes: 8 }))).toBe(
            "You've joined Monthly, at ₹1,200.50 a month. It renews next on 1 Nov 2026. It includes 8 classes a month.",
        );
    });

    it("a start still ahead says nothing is charged before it", () => {
        expect(membershipSentence(vars("STARTS_LATER"))).toBe(
            "You've joined Monthly, at ₹1,200.50 a month. It starts on 1 Nov 2026, and nothing is charged before then.",
        );
    });

    it("a pause says no charges until its date and the classes are on hold", () => {
        expect(membershipSentence(vars("PAUSED"))).toContain(
            "No charges until 1 Nov 2026; your classes are on hold.",
        );
        expect(membershipSentence(vars("PAUSED_OPEN", { on: null }))).toBe(
            "Your Monthly membership is paused. No charges while it's paused; your classes are on hold until it starts again.",
        );
    });

    it("a cancel at the period end says they keep their classes until the day", () => {
        expect(membershipSentence(vars("CANCELS_AT_END"))).toBe(
            "Your Monthly membership is cancelled. You keep your classes until 1 Nov 2026, and nothing more will be charged.",
        );
        expect(membershipSentence(vars("CANCELLED_NOW", { on: null }))).toBe(
            "Your Monthly membership is cancelled and has ended today. Nothing more will be charged.",
        );
    });

    it("a resume and a cancel taken back give the next renewal", () => {
        expect(membershipSentence(vars("RESUMED"))).toBe(
            "Your Monthly membership has started again, and your classes are back. It renews next on 1 Nov 2026.",
        );
        expect(membershipSentence(vars("KEPT"))).toContain(
            "It renews next on 1 Nov 2026.",
        );
        expect(membershipSentence(vars("KEPT", { on: null }))).toBe(
            "Your Monthly membership carries on: it's no longer set to end.",
        );
    });

    it("a plan change: booked from a day, called off, and taken effect", () => {
        expect(
            membershipSentence(
                vars("PLAN_CHANGE_BOOKED", {
                    toPlan: "Quarterly",
                    interval: "QUARTER",
                    priceMinor: 300000,
                }),
            ),
        ).toBe(
            "From 1 Nov 2026, your membership moves from Monthly to Quarterly, at ₹3,000 every 3 months. Nothing changes until then.",
        );
        expect(
            membershipSentence(
                vars("PLAN_CHANGE_CALLED_OFF", { toPlan: "Quarterly" }),
            ),
        ).toBe(
            "Your membership stays on Monthly. The move to Quarterly won't happen.",
        );
        expect(
            membershipSentence(
                vars("PLAN_CHANGED", { toPlan: "Weekly", interval: "WEEK" }),
            ),
        ).toBe(
            "Your membership has moved from Monthly to Weekly, at ₹1,200.50 a week. It renews next on 1 Nov 2026.",
        );
    });

    it("a price not known is left out rather than guessed", () => {
        expect(priceWords(vars("JOINED", { priceMinor: null }))).toBeNull();
        expect(membershipSentence(vars("JOINED", { priceMinor: null }))).toBe(
            "You've joined Monthly. It renews next on 1 Nov 2026.",
        );
    });

    it("one class is a class", () => {
        expect(
            membershipSentence(
                vars("JOINED", { classes: 1, interval: "WEEK" }),
            ),
        ).toContain("It includes 1 class a week.");
    });

    it("the email greets the member, escapes what was typed, and has a subject of its own", () => {
        const email = renderNotice({
            kind: "MEMBERSHIP_PAUSED",
            membership: vars("PAUSED", { business: "Rye <&> Co." }),
        });
        expect(email.subject).toBe("Your membership at Rye <&> Co. is paused");
        expect(email.body).toContain("Hi Asha,");
        expect(email.body).toContain("Rye &lt;&amp;&gt; Co.");
        expect(email.body).not.toContain("<&>");
    });
});

describe("which changes a member hears about", () => {
    it("maps each change to its notice, and nothing else", () => {
        expect(MEMBERSHIP_NOTICE_OF.SUBSCRIBED).toBe("MEMBERSHIP_JOINED");
        expect(MEMBERSHIP_NOTICE_OF.CANCEL_SCHEDULED).toBe(
            "MEMBERSHIP_CANCELLED",
        );
        expect(MEMBERSHIP_NOTICE_OF.PLAN_CHANGE_BOOKED).toBe(
            "MEMBERSHIP_PLAN_CHANGED",
        );
        for (const kind of [
            "RENEWED",
            "ENDED",
            "RENEWAL_FAILED",
            "MANDATE_CANCELLED",
            "COLLECTION_SKIPPED",
        ]) {
            expect(MEMBERSHIP_NOTICE_OF[kind]).toBeUndefined();
        }
    });

    it("is keyed once per event, under the Membership emails switch", () => {
        expect(membershipNoticeKey("evt_1")).toBe("membership:evt_1");
        expect(membershipNotice.setting).toBe("MEMBERSHIP");
    });

    it("reads nothing for another kind's payload, or one naming no event", async () => {
        const tx = {} as never;
        await expect(
            membershipNotice.load(
                tx,
                "org_1",
                { kind: "ORDER_READY", eventKey: "x" },
                LATE,
            ),
        ).resolves.toBeNull();
        await expect(
            membershipNotice.load(
                tx,
                "org_1",
                { kind: "MEMBERSHIP_PAUSED", eventKey: "x" },
                LATE,
            ),
        ).resolves.toBeNull();
    });
});
