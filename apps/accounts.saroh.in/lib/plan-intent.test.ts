import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/app-urls", () => ({
    getOnboardingUrl: () => "https://app.example.test/onboarding",
}));

import { onboardingForPlan, withTemplate } from "./plan-intent";

describe("a gallery template rides to onboarding (DEC-216)", () => {
    it("alone, it opens setup with the template", () => {
        expect(withTemplate(null, "salon")).toBe(
            "https://app.example.test/onboarding?template=salon",
        );
    });

    it("beside a plan, both ride", () => {
        const url = new URL(
            withTemplate(onboardingForPlan("grow", "year"), "gym") ?? "",
        );
        expect(url.searchParams.get("plan")).toBe("grow");
        expect(url.searchParams.get("cycle")).toBe("year");
        expect(url.searchParams.get("template")).toBe("gym");
    });

    it("drops anything that isn't shaped like a template", () => {
        expect(withTemplate(null, "../evil?x=1")).toBeNull();
        expect(withTemplate(null, undefined)).toBeNull();
        expect(withTemplate(null, ["clinic", "gym"])).toBe(
            "https://app.example.test/onboarding?template=clinic",
        );
    });
});
