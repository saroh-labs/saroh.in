// @vitest-environment jsdom
import { formatInr, withGstPaise } from "@saroh/pricing-catalog";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { placeholderPricingModel, pricingPageModel } from "@/lib/pricing-view";
import { fakeCatalog } from "@/lib/pricing.fixture";
import { resetTags, syncTags } from "@/lib/tags";

import { PricingPlans } from "./pricing-plans";

/** A currency sign (written as an escape: no sign in the repo) or a digit. */
const NO_PRICE = new RegExp("\\u20B9|\\d");

const gtag = vi.fn();
beforeEach(() => {
    gtag.mockClear();
    // Visit counts accepted: events go to this Analytics id (`lib/tags.ts`).
    resetTags();
    syncTags({ gaId: "G-TEST123" }, { analytics: true, ads: false });
    window.gtag = gtag;
});
afterEach(cleanup);

function card(container: HTMLElement, plan: string) {
    const el = container.querySelector<HTMLElement>(`[data-plan="${plan}"]`);
    if (!el) throw new Error(`No card for ${plan}`);
    return within(el);
}

/** The Pricing design's plans, switches and table (plans catalogue U24). */
describe("PricingPlans", () => {
    it("draws three cards, Plan B featured, with waitlist CTAs", () => {
        const { container } = render(
            <PricingPlans model={pricingPageModel(fakeCatalog())} />,
        );
        const cards = container.querySelectorAll("[data-plan]");
        expect(
            Array.from(cards).map((c) => c.getAttribute("data-plan")),
        ).toEqual(["free", "grow", "pro"]);
        const grow = card(container, "grow").getByRole("link");
        expect(grow.textContent).toBe("Get early access · Plan B");
        expect(grow.getAttribute("href")).toBe(
            "/waitlist?plan=grow&src=pricing-plans",
        );
        expect(card(container, "free").getByRole("link").textContent).toBe(
            "Join the waitlist",
        );
        expect(
            card(container, "pro").getByText("Everything in Plan B, plus:"),
        ).toBeTruthy();
    });

    it("Yearly switches the prices and sends pricing_toggle", () => {
        const { container } = render(
            <PricingPlans model={pricingPageModel(fakeCatalog())} />,
        );
        const yearly = screen.getByRole("radio", {
            name: "Yearly · 2 months free",
        });
        expect(yearly.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(yearly);
        expect(yearly.getAttribute("aria-checked")).toBe("true");
        expect(
            card(container, "grow").getByText(formatInr(111_000), {
                exact: false,
            }),
        ).toBeTruthy();
        expect(gtag).toHaveBeenCalledWith("event", "pricing_toggle", {
            control: "yearly",
            value: true,
            send_to: "G-TEST123",
        });
        // The arrow keys move back to Monthly.
        fireEvent.keyDown(yearly, { key: "ArrowLeft" });
        expect(
            screen
                .getByRole("radio", { name: "Monthly" })
                .getAttribute("aria-checked"),
        ).toBe("true");
    });

    it("Show prices with GST adds it, in the cards and the table", () => {
        const { container } = render(
            <PricingPlans model={pricingPageModel(fakeCatalog())} />,
        );
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Show prices with GST" }),
        );
        const withGst = formatInr(withGstPaise(11_100));
        expect(
            card(container, "grow").getByText(withGst, { exact: false }),
        ).toBeTruthy();
        const table = screen.getByRole("table");
        expect(within(table).getByText(withGst)).toBeTruthy();
        expect(gtag).toHaveBeenCalledWith("event", "pricing_toggle", {
            control: "gst",
            value: true,
            send_to: "G-TEST123",
        });
    });

    it("the table marks coming soon and tints the featured column", () => {
        render(<PricingPlans model={pricingPageModel(fakeCatalog())} />);
        const table = screen.getByRole("table");
        expect(within(table).getByText("Coming soon")).toBeTruthy();
        expect(
            within(table).getByRole("columnheader", { name: /Plan B/ })
                .className,
        ).toContain("bg-mk-tint");
        expect(
            within(table).getAllByText("Not included").length,
        ).toBeGreaterThan(0);
    });

    it("no yearly switch when yearly is off; add-ons show when there are some", () => {
        render(
            <PricingPlans
                model={pricingPageModel(
                    fakeCatalog((c) => {
                        c.yearly = { on: false, paid: 10 };
                    }),
                )}
            />,
        );
        expect(screen.queryByRole("radiogroup")).toBeNull();
        expect(
            screen.getByRole("heading", { name: "Need a little more?" }),
        ).toBeTruthy();
    });

    it("the placeholder: names only, no price, no switches", () => {
        const { container } = render(
            <PricingPlans model={placeholderPricingModel()} />,
        );
        expect(screen.queryByRole("checkbox")).toBeNull();
        expect(screen.queryByRole("radiogroup")).toBeNull();
        expect(container.textContent).not.toMatch(NO_PRICE);
        expect(card(container, "grow").getByRole("link").textContent).toBe(
            "Get early access · Grow",
        );
    });
});
