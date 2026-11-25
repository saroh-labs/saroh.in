/**
 * Hours and time off's page (U17; U25 on React Query): it waits with its
 * own loading shape, hands the screen only its gates (the person in
 * `?person=`, a Member's and Calendar only's rights), and a Reviewer is
 * locked out of Bookings before it is drawn. What it reads is the route's
 * (`app/api/bookings/availability/route.test.ts`).
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
    requireSession: vi.fn(),
    resolveActiveOrganization: vi.fn(),
    billingAccessOrNull: vi.fn(),
    container: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireSession: reads.requireSession }));
vi.mock("@/lib/organizations/service", () => ({
    resolveActiveOrganization: reads.resolveActiveOrganization,
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    plansOpen: () => Promise.resolve(true),
    billingAccessOrNull: reads.billingAccessOrNull,
}));
vi.mock("@/components/billing/plan-limit-notice", () => ({
    PlanLimitNotice: () => null,
}));
// The screen reads its own data: here, what the page hands it.
vi.mock("./availability-container", () => ({
    AvailabilityContainer: (props: Record<string, unknown>) => {
        reads.container(props);
        return null;
    },
}));
vi.mock("@/components/modules/gate/module-gate", () => ({
    ModuleGate: ({ children }: { children: ReactElement }) => children,
}));

import Loading from "@/app/(shell)/bookings/availability/loading";
import AvailabilityPage from "@/app/(shell)/bookings/availability/page";
import Layout from "@/app/(shell)/bookings/layout";

const OWNER = {
    id: "org_kaya",
    name: "Kaya Physio",
    role: "OWNER",
    actions: ["booking:read", "service:write", "hours:write"],
};

beforeEach(() => {
    for (const m of Object.values(reads)) m.mockReset();
    reads.requireSession.mockResolvedValue({
        user: { id: "u_mohit", name: "Mohit Mehta" },
    });
    reads.resolveActiveOrganization.mockResolvedValue(OWNER);
    reads.billingAccessOrNull.mockResolvedValue(null);
});

const page = async (search: Record<string, string> = {}) =>
    renderToStaticMarkup(
        await AvailabilityPage({ searchParams: Promise.resolve(search) }),
    );

describe("Hours and time off's page", () => {
    it("waits with its own shape and says what is loading", () => {
        const html = renderToStaticMarkup(<Loading />);
        expect(html).toContain("Hours and time off");
        expect(html).toContain("Loading availability");
        expect(html).toContain('aria-busy="true"');
    });

    it("opens on the person in ?person=, with an owner's rights", async () => {
        await page({ person: "st_meera" });
        expect(reads.container).toHaveBeenCalledWith(
            expect.objectContaining({
                person: "st_meera",
                me: "Mohit Mehta",
                business: "Kaya Physio",
                meId: "u_mohit",
                canEdit: true,
                canManage: true,
            }),
        );
    });

    it("lets a Member change hours but not who takes bookings (DEC-170)", async () => {
        reads.resolveActiveOrganization.mockResolvedValue({
            ...OWNER,
            role: "MEMBER",
            actions: ["booking:read", "booking:write", "hours:write"],
        });
        await page();
        expect(reads.container).toHaveBeenCalledWith(
            expect.objectContaining({ canEdit: true, canManage: false }),
        );
    });

    it("gives Calendar only the hours to read", async () => {
        reads.resolveActiveOrganization.mockResolvedValue({
            ...OWNER,
            role: "calendar-only",
            actions: ["booking:read", "booking:write", "service:read"],
        });
        await page();
        expect(reads.container).toHaveBeenCalledWith(
            expect.objectContaining({ canEdit: false, canManage: false }),
        );
    });

    it("locks a Reviewer out of Bookings before the page is drawn", async () => {
        reads.resolveActiveOrganization.mockResolvedValue({
            ...OWNER,
            role: "REVIEWER",
            actions: ["org:read"],
        });
        const html = renderToStaticMarkup(
            await Layout({ children: <p>the page</p> }),
        );
        expect(html).not.toContain("the page");
        expect(html).toContain("Back to Home");
    });
});
