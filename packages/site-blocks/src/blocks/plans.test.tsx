import type { RenderedPlans } from "@saroh/block-contract";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageSections } from "../section-renderer";
import { askedFromSearch } from "./enquiry";
import type { PublicPlan } from "./plans";
import PlansSection, { joinHref, planEvery, planPrice, plansOf } from "./plans";

/** Two plans on sale, as the public read returns them: most chosen first. */
const PLANS: PublicPlan[] = [
    {
        id: "p_month",
        name: "Monthly box",
        description: "Four loaves a month.",
        price: "1200.00",
        currency: "INR",
        interval: "MONTH",
        mostChosen: true,
    },
    {
        id: "p_week",
        name: "Weekly loaf",
        description: null,
        price: "350.50",
        currency: "INR",
        interval: "WEEK",
        mostChosen: false,
    },
];

const content: RenderedPlans = { title: "Memberships" };

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function cards(): HTMLElement[] {
    return screen.queryAllByRole("listitem");
}

/** The nth card, or a failure naming it. */
function card(n: number): HTMLElement {
    const found = cards().at(n);
    if (!found) throw new Error(`No card ${n}`);
    return found;
}

describe("the Plans block on a served page (G9)", () => {
    it("lists the plans in the order given, the first highlighted", () => {
        render(
            <PlansSection
                content={content}
                feed={{ plans: PLANS, joinHref: "/contact#enquiry" }}
            />,
        );
        expect(
            screen.getByRole("heading", { level: 2, name: "Memberships" }),
        ).toBeTruthy();
        const first = card(0);
        const second = card(1);
        expect(within(first).getByRole("heading").textContent).toBe(
            "Monthly box",
        );
        expect(within(second).getByRole("heading").textContent).toBe(
            "Weekly loaf",
        );
        expect(first.className).toContain("border-site-accent");
        expect(first.className).toContain("border-2");
        expect(second.className).not.toContain("border-site-accent");
        expect(within(first).getByText("Most chosen")).toBeTruthy();
        expect(screen.getAllByText("Most chosen")).toHaveLength(1);
    });

    it("shows price and how often, and the description when there is one", () => {
        render(
            <PlansSection
                content={content}
                feed={{ plans: PLANS, joinHref: null }}
            />,
        );
        expect(screen.getByText("Every month")).toBeTruthy();
        expect(screen.getByText("₹1,200 / month")).toBeTruthy();
        expect(screen.getByText("Every week")).toBeTruthy();
        expect(screen.getByText("₹350.50 / week")).toBeTruthy();
        expect(screen.getByText("Four loaves a month.")).toBeTruthy();
    });

    it("the button asks about joining, on the enquiry form, with the plan named", () => {
        render(
            <PlansSection
                content={content}
                feed={{ plans: PLANS, joinHref: "/contact#enquiry" }}
            />,
        );
        const link = screen.getByRole("link", {
            name: "Ask about joining: Monthly box",
        });
        expect(link.getAttribute("href")).toBe(
            "/contact?join=Monthly%20box#enquiry",
        );
        expect(link.textContent).toBe("Ask about joining");
    });

    it("takes the merchant's own button words", () => {
        render(
            <PlansSection
                content={{ ...content, buttonLabel: "  Join us " }}
                feed={{ plans: PLANS, joinHref: "/" }}
            />,
        );
        expect(screen.getAllByText("Join us")).toHaveLength(2);
    });

    it("with no enquiry form on the site, draws the plans with no button", () => {
        render(
            <PlansSection
                content={content}
                feed={{ plans: PLANS, joinHref: null }}
            />,
        );
        expect(cards()).toHaveLength(2);
        expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    it("highlight none: no border, no badge", () => {
        render(
            <PlansSection
                content={{ ...content, highlight: "none" }}
                feed={{ plans: PLANS, joinHref: "/" }}
            />,
        );
        expect(cards()[0]?.className).not.toContain("border-site-accent");
        expect(screen.queryByText("Most chosen")).toBeNull();
    });

    it("highlights the first without claiming Most chosen when it isn't", () => {
        render(
            <PlansSection
                content={content}
                feed={{
                    plans: PLANS.map((p) => ({ ...p, mostChosen: false })),
                    joinHref: "/",
                }}
            />,
        );
        expect(cards()[0]?.className).toContain("border-site-accent");
        expect(screen.queryByText("Most chosen")).toBeNull();
    });

    it("descriptions off hides them", () => {
        render(
            <PlansSection
                content={{ ...content, showDescriptions: false }}
                feed={{ plans: PLANS, joinHref: "/" }}
            />,
        );
        expect(screen.queryByText("Four loaves a month.")).toBeNull();
    });

    it("falls back to its own title", () => {
        render(
            <PlansSection
                content={{ title: "  " }}
                feed={{ plans: PLANS, joinHref: "/" }}
            />,
        );
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
            "Plans",
        );
    });

    it("renders nothing with no plans (none on sale, or Payments off)", () => {
        const { container } = render(
            <PlansSection
                content={content}
                feed={{ plans: [], joinHref: "/" }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("renders nothing on a live page that couldn't tell its site", () => {
        const { container } = render(
            <PlansSection content={content} siteId={null} />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("never names a payment method or promises automatic renewals (DEC-059)", () => {
        const { container } = render(
            <PlansSection
                content={content}
                feed={{ plans: PLANS, joinHref: "/" }}
            />,
        );
        expect(container.textContent).not.toMatch(
            /upi|card|autopay|automatic|razorpay|cashfree/i,
        );
    });

    it("never fetches when the page handed it the plans", () => {
        const fetchMock = vi.fn();
        const realFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;
        try {
            render(
                <PlansSection
                    content={content}
                    siteId="site_1"
                    feed={{ plans: PLANS, joinHref: "/" }}
                />,
            );
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it("reaches the block through PageSections with the page's feed", () => {
        render(
            <PageSections
                sections={[{ type: "plans", content }]}
                siteId="site_1"
                plans={{ plans: PLANS, joinHref: "/" }}
            />,
        );
        expect(cards()).toHaveLength(2);
    });
});

describe("the Plans block on the editor's canvas (G9)", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    async function drawWith(response: Response | Error) {
        const fetchMock = vi.fn(() =>
            response instanceof Error
                ? Promise.reject(response)
                : Promise.resolve(response),
        );
        globalThis.fetch = fetchMock;
        await act(async () => {
            await Promise.resolve();
            render(
                <PlansSection
                    content={content}
                    siteId="site_1"
                    apiUrl="https://api.test"
                />,
            );
        });
        return fetchMock;
    }

    it("reads the site's plans itself and draws them, the button inert", async () => {
        const fetchMock = await drawWith(json({ plans: PLANS }));
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.test/public/sites/site_1/plans",
            expect.anything(),
        );
        expect(cards()).toHaveLength(2);
        expect(screen.getAllByText("Ask about joining")).toHaveLength(2);
        expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    it("says there are no plans on sale yet, rather than vanishing", async () => {
        await drawWith(json({ plans: [] }));
        expect(screen.getByRole("status").textContent).toContain(
            "No plans on sale yet",
        );
    });

    it("with memberships not on the Saroh plan, says so instead of 'no plans yet'", async () => {
        await drawWith(json({ plans: [], payOnline: false, offered: false }));
        const note = screen.getByRole("status").textContent;
        expect(note).toContain("Memberships aren't on your Saroh plan");
        expect(note).toContain("Members you already have keep renewing");
        expect(note).not.toContain("No plans on sale yet");
        expect(cards()).toHaveLength(0);
    });

    it("with Payments off (a 404), says why the section is left off", async () => {
        await drawWith(json({ message: "Nothing to show here" }, 404));
        expect(screen.getByRole("status").textContent).toContain(
            "Payments is off",
        );
    });

    it("a failed read offers to try again, and trying again reads again", async () => {
        const fetchMock = await drawWith(new Error("offline"));
        expect(screen.getByRole("alert").textContent).toContain(
            "couldn't load your plans",
        );
        fetchMock.mockImplementation(() =>
            Promise.resolve(json({ plans: PLANS })),
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Try again" }));
            await Promise.resolve();
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(cards()).toHaveLength(2);
    });

    it("a malformed answer is an error, not a blank", async () => {
        await drawWith(json({ nope: true }));
        expect(screen.getByRole("alert")).toBeTruthy();
    });

    it("with no site at all, says where the plans come from", () => {
        render(<PlansSection content={content} />);
        expect(screen.getByRole("status").textContent).toContain(
            "Your plans on sale show here",
        );
    });
});

describe("the Plans block's words (G9)", () => {
    it("names every interval, and leaves out one it doesn't know", () => {
        expect(planEvery({ interval: "QUARTER" })).toBe("Every 3 months");
        expect(planEvery({ interval: "YEAR" })).toBe("Every year");
        expect(planEvery({ interval: "FORTNIGHT" })).toBeNull();
        expect(
            planPrice({
                price: "900.00",
                currency: "INR",
                interval: "QUARTER",
            }),
        ).toBe("₹900 / 3 months");
        expect(
            planPrice({ price: "900.00", currency: "INR", interval: "DAY" }),
        ).toBe("₹900");
    });

    it("drops a row that isn't a plan rather than drawing it", () => {
        expect(plansOf({ plans: [PLANS[0], { id: 1 }] })).toEqual([PLANS[0]]);
        expect(plansOf({})).toBeNull();
        expect(plansOf(null)).toBeNull();
    });

    it("the enquiry form words a join as a join, and an order as an order", () => {
        expect(joinHref("/", "Gold")).toBe("/?join=Gold#enquiry");
        expect(askedFromSearch("?join=Gold%20plan")).toBe(
            "I'd like to join Gold plan. ",
        );
        expect(askedFromSearch("?about=Rye")).toBe("I'd like to order Rye. ");
        // G20: "Ask about this pack" names the pack.
        expect(askedFromSearch("?pack=10%20classes")).toBe(
            "I'd like to buy 10 classes. ",
        );
        expect(askedFromSearch("?join=%20")).toBeNull();
        expect(askedFromSearch("")).toBeNull();
    });
});
