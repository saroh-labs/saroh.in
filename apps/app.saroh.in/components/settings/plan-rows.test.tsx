import { WHO_CAN_CHANGE_PLAN } from "@saroh/ui/lib/state-copy";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PlanAccessProvider } from "@/components/billing/plan-way";
import { rowOf } from "@/components/stores/location-readiness-card";
import type { ReadyAside, ReadyStep } from "@/lib/settings/ready";
import type { ReadyItem } from "@/lib/stores/location-readiness";

import { PlanAsides, planRow, readyRows } from "./ready-rows";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(""),
}));

/**
 * The plan rows inside the setup checklists (Home, Settings › Business, a
 * location) are plan prompts like any other (UX audit, 10 Oct 2026): the
 * way to the plans for someone who may change the plan, who can as text for
 * anyone else. Only the row's data changes; the one checklist draws it.
 */
const PLANS = "/settings/billing#change-plan";

const aside: ReadyAside = {
    key: "payments",
    label: "Take payment online",
    why: "Until then, customers pay you the ways you set in How to pay us.",
    comesWith: "Comes with a paid plan",
    cta: "See plans",
    href: PLANS,
};

const asides = (canChangePlan: boolean) =>
    renderToStaticMarkup(
        <PlanAccessProvider canChangePlan={canChangePlan}>
            <PlanAsides items={[aside]} />
        </PlanAccessProvider>,
    );

describe("what the plan holds back, under Home's and Business's steps", () => {
    it("links to the plans for someone who may change the plan", () => {
        const html = asides(true);
        expect(html).toContain(`href="${PLANS}"`);
        expect(html).toContain("See plans");
        expect(html).not.toContain(WHO_CAN_CHANGE_PLAN);
    });

    it("says who can, with no link, to anyone else", () => {
        const html = asides(false);
        expect(html).toContain("Take payment online");
        expect(html).toContain(WHO_CAN_CHANGE_PLAN);
        expect(html).not.toContain("See plans");
        expect(html).not.toContain("<a ");
    });
});

describe("a counted step that is the way to another plan", () => {
    const step = (href: string): ReadyStep => ({
        key: "site",
        label: "Publish your website",
        done: false,
        why: "Customers can't open it yet.",
        cta: "See plans",
        href,
        broken: false,
    });

    it("keeps its button for someone who may change the plan", () => {
        expect(readyRows([step(PLANS)], true)[0]).toMatchObject({
            action: { label: "See plans", href: PLANS },
            why: "Customers can't open it yet.",
        });
    });

    it("has no button, and says who can after why it matters, for anyone else", () => {
        const row = readyRows([step(PLANS)], false)[0];
        expect(row.action).toBeUndefined();
        expect(row.why).toBe(
            `Customers can't open it yet. ${WHO_CAN_CHANGE_PLAN}`,
        );
    });

    it("leaves every other step's button alone, whoever reads it", () => {
        const row = readyRows(
            [step("/settings/organization?edit=pay")],
            false,
        )[0];
        expect(row.action).toEqual({
            label: "See plans",
            href: "/settings/organization?edit=pay",
        });
        expect(row.why).toBe("Customers can't open it yet.");
    });

    it("a row with no line of its own says only who can", () => {
        expect(planRow({ label: "See plans", href: PLANS }, false)).toEqual({
            why: WHO_CAN_CHANGE_PLAN,
        });
    });
});

describe('a location\'s "Not taking orders on your plan" row', () => {
    const item: ReadyItem = {
        key: "plan",
        done: false,
        label: "Not taking orders on your plan",
        action: { label: "See plans", href: PLANS, inPage: false },
    };
    const jump = () => undefined;

    it("links to the plans for someone who may change the plan", () => {
        expect(rowOf(item, false, jump, true).action).toEqual({
            label: "See plans",
            href: PLANS,
        });
    });

    it("says who can, with no link, to anyone else", () => {
        const row = rowOf(item, true, jump, false);
        expect(row.action).toBeUndefined();
        expect(row.why).toBe(WHO_CAN_CHANGE_PLAN);
    });

    it("keeps a link that isn't to the plans", () => {
        const providers: ReadyItem = {
            ...item,
            key: "provider",
            action: {
                label: "Connect",
                href: "/settings/providers",
                inPage: false,
            },
        };
        expect(rowOf(providers, false, jump, false).action).toEqual({
            label: "Connect",
            href: "/settings/providers",
        });
    });
});
