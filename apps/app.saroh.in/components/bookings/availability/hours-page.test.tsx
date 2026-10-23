/**
 * Hours and time off's page (U17): it waits with its own loading shape,
 * says plainly when everyone's hours couldn't be read (with Try again),
 * opens on the person in `?person=` with a Member's and Calendar only's
 * rights, and a Reviewer is locked out of Bookings before it is drawn.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
    requireSession: vi.fn(),
    resolveActiveOrganization: vi.fn(),
    listStaff: vi.fn(),
    getBookingRules: vi.fn(),
    readBookingPayment: vi.fn(),
    readPersonRules: vi.fn(),
    readRuleRequests: vi.fn(),
    listServices: vi.fn(),
    readBookingsCalendar: vi.fn(),
    readNow: vi.fn(),
    readServiceHours: vi.fn(),
    billingAccessOrNull: vi.fn(),
    editor: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireSession: reads.requireSession }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/bookings/availability",
}));
vi.mock("@/lib/organizations/service", () => ({
    resolveActiveOrganization: reads.resolveActiveOrganization,
}));
vi.mock("@/lib/staff/service", () => ({
    listStaff: reads.listStaff,
    getBookingRules: reads.getBookingRules,
    readBookingPayment: reads.readBookingPayment,
    readPersonRules: reads.readPersonRules,
    readRuleRequests: reads.readRuleRequests,
}));
vi.mock("@/lib/services/service", () => ({
    listServices: reads.listServices,
    readBookingsCalendar: reads.readBookingsCalendar,
    readNow: reads.readNow,
}));
vi.mock("@/lib/services/service-hours-read", () => ({
    readServiceHours: reads.readServiceHours,
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: reads.billingAccessOrNull,
}));
vi.mock("@/components/billing/plan-limit-notice", () => ({
    PlanLimitNotice: () => null,
}));
// The screen itself is drawn in its own tests: here, what it is handed.
vi.mock("./availability-editor", () => ({
    AvailabilityEditor: (props: Record<string, unknown>) => {
        reads.editor(props);
        return null;
    },
}));
vi.mock("@/components/modules/gate/module-gate", () => ({
    ModuleGate: ({ children }: { children: ReactElement }) => children,
}));

import Loading from "@/app/(shell)/bookings/availability/loading";
import AvailabilityPage from "@/app/(shell)/bookings/availability/page";
import Layout from "@/app/(shell)/bookings/layout";

import { MEERA } from "./hours.test-kit";

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
    reads.readPersonRules.mockResolvedValue(null);
    reads.readRuleRequests.mockResolvedValue(null);
    reads.resolveActiveOrganization.mockResolvedValue(OWNER);
    reads.getBookingRules.mockResolvedValue(null);
    reads.readBookingPayment.mockResolvedValue(null);
    reads.listServices.mockResolvedValue([]);
    reads.readBookingsCalendar.mockResolvedValue(null);
    reads.readNow.mockReturnValue("2026-10-19T04:30:00.000Z");
    reads.readServiceHours.mockResolvedValue(null);
    reads.billingAccessOrNull.mockResolvedValue(null);
    reads.listStaff.mockResolvedValue({
        timezone: "Asia/Kolkata",
        staff: [MEERA],
        closures: [],
        openingHours: null,
    });
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

    it("says when everyone's hours couldn't be read, and offers Try again", async () => {
        reads.listStaff.mockRejectedValue(new Error("down"));
        const html = await page();
        expect(html).toContain("Couldn&#x27;t load everyone&#x27;s hours");
        expect(html).toContain("Try again");
        expect(html).toContain('href="/bookings/availability"');
        expect(reads.editor).not.toHaveBeenCalled();
    });

    it("opens on the person in ?person=, with an owner's rights", async () => {
        await page({ person: "st_meera" });
        expect(reads.editor).toHaveBeenCalledWith(
            expect.objectContaining({
                person: "st_meera",
                me: "Mohit Mehta",
                business: "Kaya Physio",
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
        expect(reads.editor).toHaveBeenCalledWith(
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
        expect(reads.editor).toHaveBeenCalledWith(
            expect.objectContaining({ canEdit: false, canManage: false }),
        );
    });

    it("reads the requests waiting for an owner, and no one diary's (#1038)", async () => {
        const waiting = [{ id: "rq_1", staffId: "st_meera" }];
        reads.readRuleRequests.mockResolvedValue(waiting);
        await page();
        expect(reads.readRuleRequests).toHaveBeenCalled();
        expect(reads.readPersonRules).not.toHaveBeenCalled();
        expect(reads.editor).toHaveBeenCalledWith(
            expect.objectContaining({
                personRules: { meId: "u_mohit", requests: waiting, mine: null },
            }),
        );
    });

    it("reads a Member's own diary's rules and request, not everyone's (#1038)", async () => {
        reads.resolveActiveOrganization.mockResolvedValue({
            ...OWNER,
            role: "MEMBER",
            actions: ["booking:read", "service:read", "hours:write"],
        });
        reads.listStaff.mockResolvedValue({
            timezone: "Asia/Kolkata",
            staff: [
                {
                    ...MEERA,
                    membership: {
                        id: "m_1",
                        userId: "u_mohit",
                        name: "Mohit Mehta",
                        email: "mohit@example.com",
                    },
                },
            ],
            closures: [],
            openingHours: null,
        });
        const mine = { staffId: "st_meera", request: null };
        reads.readPersonRules.mockResolvedValue(mine);
        await page();
        expect(reads.readPersonRules).toHaveBeenCalledWith("st_meera");
        expect(reads.readRuleRequests).not.toHaveBeenCalled();
        expect(reads.editor).toHaveBeenCalledWith(
            expect.objectContaining({
                personRules: { meId: "u_mohit", requests: null, mine },
            }),
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
