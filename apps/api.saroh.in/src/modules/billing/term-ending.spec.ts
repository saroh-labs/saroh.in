import {
    firstMonthEndingEmail,
    freeChosenNotice,
    termEndingEmail,
    termEndingNotice,
    trialEndingEmail,
} from "./billing-emails";
import { termEndingEventKey, termEndingStage } from "./term-ending";

const DAY = 24 * 60 * 60 * 1000;

describe("a 12-month term's end (DEC-100)", () => {
    const ends = new Date("2027-10-07T00:00:00.000Z");
    const at = (daysLeft: number) => new Date(ends.getTime() - daysLeft * DAY);

    it("is told 30, 7 and 1 days ahead, inside the renew window only", () => {
        expect(termEndingStage(ends, at(45))).toBeNull();
        expect(termEndingStage(ends, at(30))).toBe(30);
        expect(termEndingStage(ends, at(8))).toBe(30);
        expect(termEndingStage(ends, at(7))).toBe(7);
        expect(termEndingStage(ends, at(0.5))).toBe(1);
        expect(termEndingStage(ends, at(-1))).toBeNull();
    });

    it("keys one notice per subscription, end and stage", () => {
        expect(termEndingEventKey("sub1", ends, 7)).toBe(
            "term-ending:sub1:2027-10-07T00:00:00.000Z:7",
        );
    });

    const base = {
        businessName: "Rye & Co.",
        planName: "Plan B",
        endsOn: "7 Oct 2027",
        payUrl: "https://app.example.test/settings/billing#change-plan",
    };

    it("monthly: the 12 payments are done; asks to pay for the next term, at the price now", () => {
        const email = termEndingEmail({
            ...base,
            payment: "AUTOPAY",
            price: "₹222",
        });
        expect(email.subject).toBe(
            "Pay for Rye & Co.'s next Plan B term by 7 Oct 2027",
        );
        expect(email.html).toContain("Rye &amp; Co.&#39;s 12 monthly payments");
        expect(email.html).toContain(
            "pay for the next term in Plan and billing",
        );
        expect(email.html).toContain("₹222 a month plus GST");
        expect(email.html).toContain("moves to the Free plan on 7 Oct 2027");
        expect(email.html).toContain(`href="${base.payUrl}"`);
        expect(email.html).not.toMatch(/one tap|renews? automatically/i);
    });

    it("yearly: the year paid for ends; no price when the plan isn't offered now", () => {
        const email = termEndingEmail({
            ...base,
            payment: "ONE_TIME",
            price: null,
        });
        expect(email.html).toContain("The year Rye &amp; Co. paid for");
        expect(email.html).not.toContain("The price now");
        expect(termEndingNotice(base).title).toBe(
            "Your Plan B term ends on 7 Oct 2027",
        );
        expect(termEndingNotice(base).body).toContain("moves to Free");
    });
});

describe("a term whose owner chose Free", () => {
    it("says it moves to Free as chosen, and asks nothing", () => {
        const email = termEndingEmail({
            businessName: "Rye",
            planName: "Plan B",
            endsOn: "7 Oct 2027",
            payment: "AUTOPAY",
            price: "₹222",
            payUrl: "https://app.example.test/settings/billing",
            chosenFree: true,
        });
        expect(email.subject).toBe("Rye moves to the Free plan on 7 Oct 2027");
        expect(email.html).toContain("as you chose");
        expect(email.html).not.toMatch(/pay for the next term|₹222/i);
        expect(
            freeChosenNotice({ planName: "Plan B", endsOn: "7 Oct 2027" })
                .title,
        ).toBe("Your plan moves to Free on 7 Oct 2027, as you chose");
    });
});

describe("the first month's end against a free trial's (DEC-093)", () => {
    const input = {
        businessName: "Rye",
        planName: "Plan B",
        endsOn: "7 Nov 2026",
        total: "₹261.96",
    };

    it("a nominal first month says first month and autopay, never trial", () => {
        const email = firstMonthEndingEmail(input);
        expect(email.subject).toBe(
            "Rye's first month on Plan B ends on 7 Nov 2026",
        );
        expect(email.html).toContain("your autopay pays ₹261.96 a month");
        expect(`${email.subject} ${email.html}`).not.toMatch(/trial/i);
        expect(email.html).not.toContain("We&#39;ll charge");
    });

    it("a genuine free trial keeps its trial words", () => {
        const email = trialEndingEmail(input);
        expect(email.subject).toBe("Rye's Plan B trial ends on 7 Nov 2026");
        expect(email.html).toContain("We&#39;ll charge ₹261.96 then");
    });
});
