import { planEndingEmail, planEndingNotice } from "./billing-emails";
import { planEndingEventKey, planEndingStage } from "./plan-ending";

const DAY = 24 * 60 * 60 * 1000;
const END = new Date("2026-11-16T09:30:00.000Z");
const before = (ms: number) => new Date(END.getTime() - ms);

describe("planEndingStage", () => {
    it("is the nearest of 30, 7 and 1 days the end is within", () => {
        expect(planEndingStage(END, before(31 * DAY))).toBeNull();
        expect(planEndingStage(END, before(30 * DAY))).toBe(30);
        expect(planEndingStage(END, before(10 * DAY))).toBe(30);
        expect(planEndingStage(END, before(7 * DAY))).toBe(7);
        expect(planEndingStage(END, before(2 * DAY))).toBe(7);
        expect(planEndingStage(END, before(DAY))).toBe(1);
        expect(planEndingStage(END, before(60_000))).toBe(1);
    });

    it("is null once the end has come", () => {
        expect(planEndingStage(END, END)).toBeNull();
        expect(planEndingStage(END, new Date(END.getTime() + DAY))).toBeNull();
    });
});

describe("planEndingEventKey", () => {
    it("is one per override, end and stage", () => {
        expect(planEndingEventKey("ov_1", END, 7)).toBe(
            "plan-ending:ov_1:2026-11-16T09:30:00.000Z:7",
        );
    });
});

describe("the words", () => {
    const words = {
        planName: "Grow",
        nextPlanName: "Free",
        endsOn: "16 Nov 2026",
    };

    it("say when it ends, what follows, and that nothing is lost", () => {
        expect(planEndingNotice(words)).toEqual({
            title: "Your Grow plan ends on 16 Nov 2026",
            body: "After that, your business moves to the Free plan. Everything you made is kept. To stay on Grow, choose a plan in Settings › Plan.",
        });
        const email = planEndingEmail({ ...words, businessName: "Rye & Co." });
        expect(email.subject).toBe("Rye & Co.'s Grow plan ends on 16 Nov 2026");
        expect(email.html).toContain("Rye &amp; Co. is on the Grow plan until");
        expect(email.html).not.toContain("Rye & Co.");
    });
});
