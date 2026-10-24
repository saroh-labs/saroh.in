import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HomeModel } from "@/lib/home/service";
import type { ModuleView } from "@/lib/modules/schema";
import type { ReadyChecklist } from "@/lib/settings/ready";
import { firstSteps } from "@/lib/settings/ready";
import type { ShareLink } from "@/lib/sites/share-links";

import { HomeDashboard } from "@/components/home/dashboard/home-dashboard";
import { FirstStepsChecklist } from "./first-steps-checklist";

/**
 * Home's 4 first steps (#1194): the card, its share step, and Home leading
 * with it until the 4 are done, then the money card. What the steps count
 * is `lib/settings/ready.test.ts`; how it looks at a desk and on a phone
 * is `e2e/tests/home-first-steps.spec.ts`.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
}));

// A server action: never reached from a static render.
vi.mock("@/lib/moments/actions", () => ({ markMomentSeen: vi.fn() }));

function mod(key: string): ModuleView {
    return {
        key,
        label: key,
        lifecycle: "ENABLED",
        readiness: "ACTIVE",
        selectedForProject: false,
        canManage: true,
        dependencies: [],
        blockers: [],
    };
}

const MODULES = [mod("APPOINTMENTS"), mod("WEBSITE")];
const FACTS = {
    products: 0,
    services: 0,
    sampleServices: 0,
    bookings: 0,
    sites: 1,
    sitesNotLive: 1,
    invoices: 0,
};

const first = (setup: Partial<typeof FACTS> = {}, shared = false) =>
    firstSteps({
        settings: { setup: { ...FACTS, ...setup }, tradingSince: null },
        modules: MODULES,
        shared,
    });

const LINK: ShareLink = {
    kind: "book",
    url: "https://rye.saroh.app/book",
    label: "Share your booking page",
    copied: "Booking page link copied",
};

/** One money step left: the card Home shows once the 4 are done. */
const MONEY: ReadyChecklist = {
    steps: [
        {
            key: "payments",
            label: "Connect payments",
            why: "So money reaches your bank.",
            cta: "Connect payments",
            href: "/settings/providers",
            broken: false,
            done: false,
        },
    ],
    left: [],
    done: 0,
    total: 1,
    outside: [],
};

describe("FirstStepsChecklist", () => {
    it("a new business: Finish setup, 0 of 4, each step with its button", () => {
        const html = renderToStaticMarkup(
            <FirstStepsChecklist first={first()} businessId="org_1" />,
        );
        expect(html).toContain('data-setup-checklist="home-first"');
        expect(html).toContain("Finish setup");
        expect(html).toContain("0 of 4");
        for (const label of [
            "Publish your site",
            "Add your first service",
            "Share your booking link",
            "Take your first booking",
        ]) {
            expect(html).toContain(label);
        }
        // Not live yet: the share step goes where the booking page is.
        expect(html).toContain('href="/services"');
    });

    it("a live link: the share step is a press that shares it, not a link", () => {
        const html = renderToStaticMarkup(
            <FirstStepsChecklist
                first={first({ sitesNotLive: 0 })}
                share={LINK}
                businessId="org_1"
            />,
        );
        expect(html).toMatch(/<button[^>]*>Share link<\/button>/);
        expect(html).not.toContain('href="/services"');
    });

    it("only samples: Review your sample services, to the list with Keep all", () => {
        const html = renderToStaticMarkup(
            <FirstStepsChecklist
                first={first({ sampleServices: 3 })}
                businessId="org_1"
            />,
        );
        expect(html).toContain("Review your sample services");
        expect(html).toContain("0 of 4");
    });

    it("all 4 done: nothing, the money card takes its place", () => {
        const html = renderToStaticMarkup(
            <FirstStepsChecklist
                first={first(
                    { sitesNotLive: 0, services: 2, bookings: 1 },
                    true,
                )}
                businessId="org_1"
            />,
        );
        expect(html).toBe("");
    });
});

describe("Home leads with the 4 steps, then the money card", () => {
    const model = {
        view: "business",
        staff: null,
        actions: [],
        hasAnyModule: true,
        upcoming: [],
        unavailable: [],
        needs: [],
        needsTotal: 0,
        ordersInProgress: 0,
        today: null,
        lastDay: null,
        week: null,
    } as unknown as HomeModel;

    const render = (done: boolean) =>
        renderToStaticMarkup(
            <HomeDashboard
                home={model}
                modules={null}
                businessName="Rye & Co."
                setup={{
                    list: MONEY,
                    businessId: "org_1",
                    first: done
                        ? first(
                              { sitesNotLive: 0, services: 2, bookings: 1 },
                              true,
                          )
                        : first(),
                }}
            />,
        );

    it("while any of the 4 is left: the 4 steps, and no money step on Home", () => {
        const html = render(false);
        expect(html).toContain('data-setup-checklist="home-first"');
        expect(html).not.toContain("Connect payments");
    });

    it("once the 4 are done: the money card, and no first steps", () => {
        const html = render(true);
        expect(html).not.toContain('data-setup-checklist="home-first"');
        expect(html).toContain("Connect payments");
    });
});
