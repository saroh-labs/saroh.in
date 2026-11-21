import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/app-urls", () => ({
    getOnboardingUrl: () => "https://app.example.test/onboarding",
}));

import {
    BUSINESS_NAME_MAX,
    onboardingForPlan,
    withTemplate,
    withTried,
} from "./plan-intent";

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

describe("the website library's Try rides to onboarding (U12)", () => {
    const query = (url: string | null) => new URL(url ?? "").searchParams;

    it("carries a name, a known trade and a template's colourway", () => {
        const q = query(
            withTried(null, {
                name: "  Rasoi   & Co ",
                trade: "food",
                colour: "kesar",
            }),
        );
        expect(q.get("name")).toBe("Rasoi & Co");
        expect(q.get("trade")).toBe("food");
        expect(q.get("colour")).toBe("kesar");
    });

    it("drops an unknown trade or colourway", () => {
        const q = query(
            withTried(null, { name: "Noor", trade: "bakery", colour: "neon" }),
        );
        expect(q.get("name")).toBe("Noor");
        expect(q.has("trade")).toBe(false);
        expect(q.has("colour")).toBe(false);
        expect(withTried(null, { trade: "x", colour: "<b>" })).toBeNull();
    });

    it("cuts the name to the business-name limit", () => {
        const q = query(withTried(null, { name: "a".repeat(500) }));
        expect(q.get("name")).toHaveLength(BUSINESS_NAME_MAX);
    });

    it("rides beside a plan and a template", () => {
        const q = query(
            withTried(
                withTemplate(onboardingForPlan("grow", "month"), "salon"),
                {
                    name: "Noor",
                    trade: "salon",
                },
            ),
        );
        expect(q.get("plan")).toBe("grow");
        expect(q.get("template")).toBe("salon");
        expect(q.get("name")).toBe("Noor");
    });
});
