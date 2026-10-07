import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ReadyChecklist as Checklist } from "@/lib/settings/ready";

import { TakeMoneyChecklist } from "../home/take-money-checklist";
import { ReadyChecklist } from "./ready-checklist";

/**
 * On a plan without online payments (DEC-092), Settings › Business and Home
 * list "Take payment online" beside the steps, outside the count, with the
 * plan that has it and See plans.
 */
const list: Checklist = {
    steps: [
        {
            key: "address",
            label: "Add your registered address",
            why: "It's printed on every invoice you send.",
            cta: "Add address",
            href: "/settings/organization?tab=address",
            broken: false,
            done: false,
        },
        {
            key: "site",
            label: "Publish your site",
            why: "Nobody can find you until it's live.",
            cta: "Publish site",
            href: "/sites",
            broken: false,
            done: true,
        },
    ],
    left: [
        {
            key: "address",
            label: "Add your registered address",
            why: "It's printed on every invoice you send.",
            cta: "Add address",
            href: "/settings/organization?tab=address",
            broken: false,
        },
    ],
    done: 1,
    total: 2,
    outside: [
        {
            key: "payments",
            label: "Take payment online",
            why: "Until then, customers pay you the ways you set in How to pay us.",
            comesWith: "Comes with a paid plan",
            cta: "See plans",
            href: "/settings/billing#change-plan",
        },
    ],
};

describe("the plan's aside on the setup checklists (DEC-092)", () => {
    it("Settings › Business shows it outside the count", () => {
        const html = renderToStaticMarkup(<ReadyChecklist list={list} />);
        expect(html).toContain("1 of 2 done");
        expect(html).toContain("Take payment online");
        expect(html).toContain("Comes with a paid plan");
        expect(html).toContain('href="/settings/billing#change-plan"');
        expect(html).toContain("See plans");
    });

    it("Home shows it outside the count", () => {
        const html = renderToStaticMarkup(
            <TakeMoneyChecklist list={list} businessId="org_1" slot="late" />,
        );
        expect(html).toContain("1 of 2 done");
        expect(html).toContain("Comes with a paid plan");
        expect(html).toContain('href="/settings/billing#change-plan"');
    });

    it("Home's bar has a segment per counted step, none for the aside", () => {
        const early: Checklist = {
            ...list,
            steps: list.steps.map((s) => ({ ...s, done: false })),
            done: 0,
        };
        const html = renderToStaticMarkup(
            <TakeMoneyChecklist list={early} businessId="org_1" slot="first" />,
        );
        expect(html).toContain("0 of 2 done");
        expect(html).toContain("Take payment online");
        expect(html.match(/h-1 flex-1 rounded-sm/g)).toHaveLength(2);
    });

    it("draws nothing on Settings once every counted step is done", () => {
        const done: Checklist = {
            ...list,
            steps: list.steps.map((s) => ({ ...s, done: true })),
            left: [],
            done: 2,
        };
        expect(renderToStaticMarkup(<ReadyChecklist list={done} />)).toBe("");
    });
});
