import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { daysLeft, PlanEndingBanner } from "./plan-ending-banner";

const NOW = new Date("2026-10-13T05:00:00.000Z");
const ending = {
    planName: "Grow",
    endsAt: "2026-10-19T09:30:00.000Z",
    nextPlanName: "Free",
};

describe("PlanEndingBanner", () => {
    it("counts whole days left, never 0", () => {
        expect(daysLeft(ending.endsAt, NOW)).toBe(7);
        expect(daysLeft("2026-10-13T06:00:00.000Z", NOW)).toBe(1);
    });

    it("says when the plan ends, what follows, and the way to stay on it", () => {
        const html = renderToStaticMarkup(
            <PlanEndingBanner ending={ending} now={NOW} />,
        );
        expect(html).toContain('role="status"');
        expect(html).toContain("Your Grow plan ends in 7 days");
        expect(html).toContain("on Free, and everything you made is kept");
        expect(html).toContain('href="/settings/billing#change-plan"');
        expect(html).toContain("Choose a plan");
    });

    it("says 1 day, not 1 days", () => {
        const html = renderToStaticMarkup(
            <PlanEndingBanner
                ending={{ ...ending, endsAt: "2026-10-13T20:00:00.000Z" }}
                now={NOW}
            />,
        );
        expect(html).toContain("ends in 1 day<");
    });

    it("shows nothing with no ending plan", () => {
        expect(
            renderToStaticMarkup(<PlanEndingBanner ending={null} now={NOW} />),
        ).toBe("");
    });
});
