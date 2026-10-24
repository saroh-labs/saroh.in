// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { solutions } from "@/content/solutions";
import { track } from "@/lib/analytics";
import { demoHref } from "@/lib/demos";
import { placeholderPricingModel } from "@/lib/pricing-view";

import { HomeHero } from "./home/home-hero";
import { PricingPage } from "./pricing/pricing-page";
import { SolutionHero } from "./solution/solution-hero";

/** "See a live demo" (#1191): behind NEXT_PUBLIC_DEMOS, off when unset. */
const env = vi.hoisted(() => ({
    NEXT_PUBLIC_DEMOS: undefined as string | undefined,
    NEXT_PUBLIC_SITES_DOMAIN: undefined as string | undefined,
}));
vi.mock("@/env", () => ({ env }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
    cleanup();
    env.NEXT_PUBLIC_DEMOS = undefined;
    env.NEXT_PUBLIC_SITES_DOMAIN = undefined;
    vi.mocked(track).mockClear();
});

const demo = () => screen.queryByRole("link", { name: "See a live demo" });

describe("demoHref", () => {
    it("is the demo's booking page on the merchant-site domain, only when on", () => {
        expect(demoHref("salon", "on", "saroh.app")).toBe(
            "https://demo-salon.saroh.app/book",
        );
        expect(demoHref("gym", "on", "saroh.app.localhost")).toBe(
            "https://demo-gym.saroh.app.localhost/book",
        );
        expect(demoHref("salon", "off", "saroh.app")).toBeNull();
        expect(demoHref("salon", undefined, "saroh.app")).toBeNull();
    });
});

describe("flag on", () => {
    it("home opens the salon demo in a new tab", () => {
        env.NEXT_PUBLIC_DEMOS = "on";
        render(<HomeHero freeLine="Free to start." />);
        expect(demo()?.getAttribute("href")).toBe(
            "https://demo-salon.saroh.app/book",
        );
        expect(demo()?.getAttribute("target")).toBe("_blank");
        expect(demo()?.getAttribute("rel")).toContain("noopener");
    });

    it("the gyms page opens the gym demo, other trades the salon", () => {
        env.NEXT_PUBLIC_DEMOS = "on";
        env.NEXT_PUBLIC_SITES_DOMAIN = "saroh.app.localhost";
        render(
            <SolutionHero
                solution={solutions.gyms}
                freeLine="Free to start."
            />,
        );
        expect(demo()?.getAttribute("href")).toBe(
            "https://demo-gym.saroh.app.localhost/book",
        );
        cleanup();
        render(
            <SolutionHero
                solution={solutions.clinics}
                freeLine="Free to start."
            />,
        );
        expect(demo()?.getAttribute("href")).toBe(
            "https://demo-salon.saroh.app.localhost/book",
        );
    });

    it("the pricing page shows it", () => {
        env.NEXT_PUBLIC_DEMOS = "on";
        render(<PricingPage model={placeholderPricingModel()} />);
        expect(demo()).not.toBeNull();
    });

    it("a click sends demo_open with the page and trade", () => {
        env.NEXT_PUBLIC_DEMOS = "on";
        render(
            <SolutionHero
                solution={solutions.gyms}
                freeLine="Free to start."
            />,
        );
        fireEvent.click(screen.getByRole("link", { name: "See a live demo" }));
        expect(track).toHaveBeenCalledWith("demo_open", {
            page: "solutions-gyms",
            trade: "gym",
        });
    });
});

describe("flag off", () => {
    it("shows no button anywhere", () => {
        render(<HomeHero freeLine="Free to start." />);
        render(
            <SolutionHero
                solution={solutions.gyms}
                freeLine="Free to start."
            />,
        );
        render(<PricingPage model={placeholderPricingModel()} />);
        expect(demo()).toBeNull();
    });
});
