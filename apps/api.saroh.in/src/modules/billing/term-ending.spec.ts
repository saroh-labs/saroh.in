import {
    firstMonthEndingEmail,
    freeChosenNotice,
    priceChangeEmail,
    priceChangeNotice,
    termEndingEmail,
    termEndingNotice,
    trialEndingEmail,
} from "./billing-emails";
import { termEndingEventKey, termEndingStage } from "./term-ending";

const DAY = 24 * 60 * 60 * 1000;

describe("an autopay that runs out (DEC-100, DEC-161)", () => {
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

    it("monthly: the autopay runs out; asks to approve the next one, at the price now (DEC-161)", () => {
        const email = termEndingEmail({
            ...base,
            payment: "AUTOPAY",
            charges: 12,
            price: "₹222",
        });
        expect(email.subject).toBe(
            "Approve Rye & Co.'s next Plan B autopay by 7 Oct 2027",
        );
        expect(email.html).toContain(
            "The autopay you approved for Rye &amp; Co.&#39;s Plan B plan covers 12 monthly charges, and it runs out on 7 Oct 2027.",
        );
        expect(email.html).toContain(
            "approve the next autopay in Plan and billing. It&#39;s one confirmation",
        );
        expect(email.html).toContain("₹222 a month plus GST");
        expect(email.html).toContain("moves to the Free plan on 7 Oct 2027");
        expect(email.html).toContain(`href="${base.payUrl}"`);
        expect(email.html).toContain("Approve the next autopay");
        expect(`${email.subject} ${email.html}`).not.toMatch(
            /\bterm\b|one tap|renews? automatically|price doesn&#39;t change/i,
        );
    });

    it("monthly: says the count the autopay was made for", () => {
        const email = termEndingEmail({
            ...base,
            payment: "AUTOPAY",
            charges: 60,
            price: null,
        });
        expect(email.html).toContain("covers 60 monthly charges");
        expect(email.html).not.toContain("The price now");
    });

    it("yearly: the year paid for ends; no price when the plan isn't offered now", () => {
        const email = termEndingEmail({
            ...base,
            payment: "ONE_TIME",
            price: null,
        });
        expect(email.subject).toBe(
            "Pay for Rye & Co.'s next Plan B year by 7 Oct 2027",
        );
        expect(email.html).toContain("The year Rye &amp; Co. paid for");
        expect(email.html).not.toContain("The price now");
        expect(`${email.subject} ${email.html}`).not.toMatch(/\bterm\b/i);
        const year = termEndingNotice({ ...base, payment: "ONE_TIME" });
        expect(year.title).toBe("Your Plan B year ends on 7 Oct 2027");
        expect(year.body).toContain("pay for the next year");
    });

    it("the inbox notice asks to approve the next autopay", () => {
        const n = termEndingNotice({ ...base, payment: "AUTOPAY" });
        expect(n.title).toBe("Your Plan B autopay runs out on 7 Oct 2027");
        expect(n.body).toContain(
            "To keep Plan B, approve the next autopay in Plan and billing.",
        );
        expect(n.body).toContain("moves to Free");
        expect(`${n.title} ${n.body}`).not.toMatch(/\bterm\b/i);
        // Monthly is the default.
        expect(termEndingNotice(base).title).toBe(n.title);
    });
});

describe("a price change ahead (DEC-161)", () => {
    const words = {
        businessName: "Rye & Co.",
        planName: "Plan B",
        changesOn: "14 Nov 2026",
        now: "₹222 a month plus GST",
        next: "₹333 a month plus GST",
        url: "https://app.example.test/settings/billing",
    };

    it("emails the new amount, asks for approval, and keeps the price until then", () => {
        const email = priceChangeEmail(words);
        expect(email.subject).toBe(
            "Rye & Co.'s Plan B price changes on 14 Nov 2026",
        );
        expect(email.html).toContain(
            "From 14 Nov 2026, the Plan B plan is ₹333 a month plus GST. Rye &amp; Co. pays ₹222 a month plus GST now.",
        );
        expect(email.html).toContain("approve the new one in Plan and billing");
        expect(email.html).toContain(
            "Until you approve it, you keep paying ₹222 a month plus GST",
        );
        expect(email.html).toContain("Approve the new amount");
        expect(email.html).not.toMatch(/\bterm\b|moves to (the )?Free/i);
    });

    it("says the same in the inbox", () => {
        const n = priceChangeNotice(words);
        expect(n.title).toBe("Your Plan B price changes on 14 Nov 2026");
        expect(n.body).toBe(
            "From 14 Nov 2026, Plan B is ₹333 a month plus GST (now ₹222 a month plus GST). Approve the new amount in Plan and billing. Until you do, you keep paying ₹222 a month plus GST.",
        );
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
        expect(email.html).not.toMatch(/approve the next|₹222/i);
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
