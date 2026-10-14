/**
 * A plan prompt knows who is reading it (UX audit, 10 Oct 2026): the way
 * to another plan for someone who may change it, who can for anyone else.
 * One answer from the shell, read by every prompt.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
    isPlanHref,
    mayChangePlan,
    mayOpenPlan,
} from "@/lib/billing/plan-access";

import { LimitNoticeBlock } from "./limit-notice";
import { PlanEndingBanner } from "./plan-ending-banner";
import {
    LimitReachedCard,
    PlanAccessProvider,
    PlanLockedCard,
    PlanWay,
} from "./plan-way";

const WHO = "The owner can change the plan in Settings › Plan and billing.";
const HREF = "/settings/billing/plans?plan=grow";

const as = (canChangePlan: boolean, node: React.ReactNode) =>
    renderToStaticMarkup(
        <PlanAccessProvider canChangePlan={canChangePlan}>
            {node}
        </PlanAccessProvider>,
    );

describe("who may open Plan and billing, and who may change the plan", () => {
    it("asks the API's two permissions, never the role's name", () => {
        const reads = { role: "MEMBER", actions: ["billing:read"] };
        expect(mayOpenPlan(reads)).toBe(true);
        expect(mayChangePlan(reads)).toBe(false);
        const manages = {
            role: "MEMBER",
            actions: ["billing:read", "billing:manage"],
        };
        expect(mayChangePlan(manages)).toBe(true);
        // An owner whose resolved list lacks it is asked the same way.
        expect(mayOpenPlan({ role: "OWNER", actions: [] })).toBe(false);
    });

    it("falls back to the built-in map when no permissions came back: only the Owner changes", () => {
        for (const role of ["OWNER", "ADMIN"]) {
            expect(mayOpenPlan({ role })).toBe(true);
        }
        expect(mayChangePlan({ role: "OWNER" })).toBe(true);
        // An Admin reads Plan and billing and changes nothing there
        // (DEC-131, amended 2026-10-11).
        expect(mayChangePlan({ role: "ADMIN" })).toBe(false);
        expect(mayChangePlan({ role: "ADMIN", actions: null })).toBe(false);
        for (const role of ["MEMBER", "REVIEWER"]) {
            expect(mayOpenPlan({ role })).toBe(false);
            expect(mayChangePlan({ role })).toBe(false);
        }
        expect(mayChangePlan(null)).toBe(false);
    });

    it("reads an Admin as the API resolves one: opens, never changes", () => {
        // What `GET /organizations` sends for an Admin: `billing:read`
        // and no `billing:manage`.
        const admin = {
            role: "ADMIN",
            actions: ["org:read", "member:invite", "billing:read"],
        };
        expect(mayOpenPlan(admin)).toBe(true);
        expect(mayChangePlan(admin)).toBe(false);
    });

    it("knows a link to the plans from any other", () => {
        expect(isPlanHref(HREF)).toBe(true);
        expect(isPlanHref("/settings/billing/plans")).toBe(true);
        expect(isPlanHref("/settings/providers")).toBe(false);
        expect(isPlanHref(null)).toBe(false);
    });
});

describe("PlanWay", () => {
    const link = <a href={HREF}>See Grow</a>;

    it("draws the link for someone who may change the plan", () => {
        const html = as(true, <PlanWay>{link}</PlanWay>);
        expect(html).toContain(`href="${HREF}"`);
        expect(html).not.toContain(WHO);
    });

    it("says who can, as text, for anyone else", () => {
        const html = as(false, <PlanWay>{link}</PlanWay>);
        expect(html).not.toContain("<a");
        expect(html).not.toContain("See Grow");
        expect(html).toContain(WHO);
    });

    it("draws the link with no shell above it: the page it opens decides", () => {
        expect(renderToStaticMarkup(<PlanWay>{link}</PlanWay>)).toContain(
            `href="${HREF}"`,
        );
    });

    it("takes a fallback, or nothing, where a sentence already says it", () => {
        expect(as(false, <PlanWay fallback="Grow">{link}</PlanWay>)).toBe(
            "Grow",
        );
        expect(as(false, <PlanWay fallback={null}>{link}</PlanWay>)).toBe("");
    });

    it("leaves a link that isn't to the plans alone", () => {
        const html = as(
            false,
            <PlanWay when={isPlanHref("/settings/providers")}>
                <a href="#providers">Connect one</a>
            </PlanWay>,
        );
        expect(html).toContain('href="#providers"');
    });
});

describe("every plan prompt reads the same answer", () => {
    it("a locked card: the plan link, or who can", () => {
        const card = <PlanLockedCard name="Bookings" plan="Grow" href={HREF} />;
        expect(as(true, card)).toContain("See Grow");
        const html = as(false, card);
        expect(html).toContain("Bookings comes with Grow");
        expect(html).not.toContain("See Grow");
        expect(html).toContain(WHO);
    });

    it("a limit card: the plan link, or who can", () => {
        const card = (
            <LimitReachedCard
                title="You're at 20 of 20 products"
                description="Archive or delete one to make room."
                plan="Grow"
                href={HREF}
            />
        );
        expect(as(true, card)).toContain("See Grow");
        const html = as(false, card);
        expect(html).not.toContain("See Grow");
        expect(html).toContain(WHO);
    });

    it("a limit notice: its button, or who can", () => {
        const notice = (
            <LimitNoticeBlock
                full
                title="You've reached your 20 products on Free"
                body="You can't add more."
                cta="See Grow"
                href={HREF}
            />
        );
        expect(as(true, notice)).toContain(`href="${HREF}"`);
        const html = as(false, notice);
        expect(html).toContain("You can&#x27;t add more.");
        expect(html).not.toContain("<a");
        expect(html).toContain(WHO);
    });

    it("the plan-ending banner: See plans, or who can", () => {
        const ending = {
            planName: "Grow",
            nextPlanName: "Free",
            // Far enough ahead to be inside the banner's window on any day.
            endsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        };
        const banner = <PlanEndingBanner ending={ending} />;
        expect(as(true, banner)).toContain("See plans");
        const html = as(false, banner);
        expect(html).not.toContain("See plans");
        expect(html).toContain(WHO);
    });
});
