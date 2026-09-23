import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { OrgAction } from "../organizations/organization-actions";
import { HomeService } from "./home.service";

/**
 * Home's two lead bands, against the role that may not read leads (DEC-020).
 *
 * Reaching CRM is not reading leads: since a Member holds `contact:read`, the
 * module is available to them for the people on the diary. Home used to take
 * that availability as permission and put the pipeline on their first screen —
 * the open-leads number, and overdue follow-ups with each lead's own title.
 */

const OVERDUE = {
    id: "act_1",
    title: "Call back about the annual plan",
    dueAt: new Date("2026-09-01T08:00:00Z"),
    lead: {
        id: "lead_1",
        title: "Annual membership",
        contact: { firstName: "Asha", lastName: "Rao" },
    },
};

function build() {
    const availability = {
        listViews: jest.fn().mockResolvedValue([
            {
                key: "CRM",
                label: "CRM",
                readiness: "ACTIVE",
                blockers: [],
            },
        ]),
    } as unknown as ModuleAvailabilityService;
    const db = {
        lead: { count: jest.fn().mockResolvedValue(7) },
        contact: { count: jest.fn().mockResolvedValue(24) },
        activity: {
            count: jest.fn().mockResolvedValue(1),
            findMany: jest.fn().mockResolvedValue([OVERDUE]),
        },
    };
    return { service: new HomeService(availability, db as never), db };
}

const MEMBER = {
    organizationId: "org_1",
    organizationRole: "MEMBER" as const,
    organizationActions: new Set<OrgAction>([
        "contact:read",
        "booking:read",
        "service:read",
    ]),
};

const OWNER = { organizationId: "org_1", organizationRole: "OWNER" as const };

describe("HomeService lead bands", () => {
    it("offers a Member no open-leads number and never counts leads", async () => {
        const { service, db } = build();

        const home = await service.build(MEMBER);

        expect(home.numbers.map((n) => n.key)).not.toContain("OPEN_LEADS");
        expect(db.lead.count).not.toHaveBeenCalled();
        // The people band stays: that is what a Member reaches CRM for.
        expect(home.numbers.map((n) => n.key)).toContain("CONTACTS");
    });

    it("keeps overdue follow-ups, and their lead titles, from a Member", async () => {
        const { service, db } = build();

        const home = await service.build(MEMBER);

        const codes = home.actions.map((a) => a.code);
        expect(codes).not.toContain("CRM_OVERDUE_FOLLOWUPS");
        expect(db.activity.findMany).not.toHaveBeenCalled();
    });

    it("still gives an owner both", async () => {
        const { service } = build();

        const home = await service.build(OWNER);

        expect(home.numbers.map((n) => n.key)).toContain("OPEN_LEADS");
        expect(home.actions.map((a) => a.code)).toContain(
            "CRM_OVERDUE_FOLLOWUPS",
        );
    });
});
