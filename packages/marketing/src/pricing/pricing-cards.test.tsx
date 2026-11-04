// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PricingCards } from "./pricing-cards";
import type {
    PlanCardView,
    PricingPageModel,
    PricingView,
} from "./pricing-model";
import { PricingPlans } from "./pricing-plans";
import { usePricingSwitches } from "./use-pricing-switches";

afterEach(cleanup);

const plan = (id: string, price: string): PlanCardView => ({
    id,
    name: `Plan ${id}`,
    tagline: "",
    featured: id === "b",
    price,
    per: "a month",
    sub: "",
    cta: { plan: id, planName: `Plan ${id}`, paid: true, cycle: "month" },
    lead: "",
    trial: "",
    lines: [{ t: "A line", soon: false }],
});

const view = (ids: string[], suffix: string): PricingView => ({
    plans: ids.map((id) => plan(id, `${id}${suffix}`)),
    usage: {
        rows: [
            {
                kind: "line",
                label: "Things",
                what: "",
                cells: ids.map(() => "Some"),
            },
        ],
        notes: ["A note"],
    },
    footnote: "A footnote",
});

const model = (
    ids: string[],
    tax = { toggle: true, initial: false },
): PricingPageModel => ({
    placeholder: false,
    yearly: { freeMonths: 2 },
    tax,
    views: {
        "month-excl": view(ids, "-me"),
        "month-incl": view(ids, "-mi"),
        "year-excl": view(ids, "-ye"),
        "year-incl": view(ids, "-yi"),
    },
    rows: [
        {
            kind: "line",
            label: "A row",
            soon: false,
            cells: ids.map(() => ({ yes: true, t: "Yes" })),
        },
    ],
});

function Page({
    m,
    withToggle = true,
    onYearly,
}: {
    m: PricingPageModel;
    withToggle?: boolean;
    onYearly?: (v: boolean) => void;
}) {
    const switches = usePricingSwitches(m);
    return (
        <PricingPlans
            model={m}
            switches={switches}
            usageTitle="Usage"
            usageLead="Lead"
            placeholderNote="None"
            cards={
                <PricingCards
                    model={m}
                    switches={switches}
                    onYearlyChange={onYearly}
                    cta={(p) => <a href={`/s/${p.id}`}>Go {p.id}</a>}
                    taxToggle={
                        withToggle
                            ? (checked, onChange) => (
                                  <input
                                      aria-label="Tax"
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) =>
                                          onChange(e.target.checked)
                                      }
                                  />
                              )
                            : undefined
                    }
                />
            }
        />
    );
}

describe("the pricing tables", () => {
    it("cards and both tables follow the site's toggle and Yearly", () => {
        const onYearly = vi.fn();
        const { container } = render(
            <Page m={model(["a", "b", "c"])} onYearly={onYearly} />,
        );
        const prices = () =>
            container.querySelector('[data-plan="b"]')?.textContent;
        expect(prices()).toContain("b-me");
        fireEvent.click(screen.getByRole("checkbox", { name: "Tax" }));
        expect(prices()).toContain("b-mi");
        fireEvent.click(screen.getByRole("radio", { name: /Yearly/ }));
        expect(prices()).toContain("b-yi");
        expect(onYearly).toHaveBeenCalledWith(true);
        expect(
            screen.getByRole("region", { name: "Usage table" }),
        ).toBeTruthy();
        expect(
            screen.getByRole("region", { name: "Plan comparison table" })
                .textContent,
        ).toContain("b-yi");
    });

    it.each([[["a"]], [["a", "b"]], [["a", "b", "c", "d"]]])(
        "any number of plans lays out: %j",
        (ids) => {
            const { container } = render(<Page m={model(ids)} />);
            expect(container.querySelectorAll("[data-plan]")).toHaveLength(
                ids.length,
            );
            const table = screen.getByRole("region", {
                name: "Plan comparison table",
            });
            expect(table.querySelectorAll("thead th")).toHaveLength(
                ids.length + 1,
            );
        },
    );

    it("the package has no tax box of its own", () => {
        render(<Page m={model(["a"])} withToggle={false} />);
        expect(screen.queryByRole("checkbox")).toBeNull();
        cleanup();
        render(<Page m={model(["a"], { toggle: false, initial: false })} />);
        expect(screen.queryByRole("checkbox")).toBeNull();
    });
});
