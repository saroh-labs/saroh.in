import { NotFoundException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { CustomerWorkspaceService } from "./customer-workspace.service";

const CTX: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

function make(overrides: Record<string, unknown> = {}) {
    const db = {
        contact: {
            findFirst: jest
                .fn()
                .mockResolvedValue({
                    id: "c1",
                    email: "a@x.com",
                    phone: "+1 (555) 000",
                }),
        },
        customer: {
            findFirst: jest.fn().mockResolvedValue({ id: "cust1" }),
            findMany: jest.fn().mockResolvedValue([]),
        },
        customerIdentityLink: {
            findMany: jest.fn().mockResolvedValue([]),
            upsert: jest.fn().mockResolvedValue({}),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        lead: { findMany: jest.fn().mockResolvedValue([]) },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
        order: { findMany: jest.fn().mockResolvedValue([]) },
        message: { findMany: jest.fn().mockResolvedValue([]) },
        auditEvent: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(db)),
        ...overrides,
    };
    const availability = {
        listViews: jest.fn().mockResolvedValue([
            { key: "CRM", readiness: "ACTIVE" },
            { key: "COMMERCE", readiness: "DISABLED" },
            { key: "APPOINTMENTS", readiness: "DISABLED" },
            { key: "COMMUNICATIONS", readiness: "DISABLED" },
        ]),
    } as unknown as ModuleAvailabilityService;
    return {
        svc: new CustomerWorkspaceService(availability, db as never),
        db,
        availability,
    };
}

describe("CustomerWorkspaceService", () => {
    it("suggests by exact email/phone and NEVER by name", async () => {
        const { svc, db } = make();
        db.customer.findMany.mockResolvedValue([
            {
                id: "cust1",
                email: "A@X.com",
                firstName: "Al",
                lastName: "Bo",
                phone: "999",
            },
        ]);
        const suggestions = await svc.suggestLinks(CTX, "c1");

        // Query is by email/phone only — no name fields in the OR filter.
        const where = db.customer.findMany.mock.calls[0][0].where;
        const orJson = JSON.stringify(where.OR);
        expect(orJson).toContain("email");
        expect(orJson.toLowerCase()).not.toContain("firstname");
        expect(orJson.toLowerCase()).not.toContain("lastname");

        expect(suggestions[0].matchedOn).toContain("email");
        expect(suggestions[0].customerId).toBe("cust1");
    });

    it("returns a suggestion, not an automatic link", async () => {
        const { svc, db } = make();
        db.customer.findMany.mockResolvedValue([
            {
                id: "cust1",
                email: "a@x.com",
                firstName: null,
                lastName: null,
                phone: null,
            },
        ]);
        await svc.suggestLinks(CTX, "c1");
        // Suggesting must never write a link.
        expect(db.customerIdentityLink.upsert).not.toHaveBeenCalled();
    });

    it("refuses to link a Customer from another Organization", async () => {
        const { svc, db } = make();
        db.customer.findFirst.mockResolvedValue(null); // not in this org
        await expect(svc.link(CTX, "c1", "cust_other")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(db.customerIdentityLink.upsert).not.toHaveBeenCalled();
    });

    it("links within the org and writes an audit event", async () => {
        const { svc, db } = make();
        await svc.link(CTX, "c1", "cust1");
        expect(db.customerIdentityLink.upsert).toHaveBeenCalled();
        expect(db.auditEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: "customer.identity.linked",
                }),
            }),
        );
    });

    it("excludes unavailable modules from the timeline", async () => {
        const { svc, db } = make();
        db.lead.findMany.mockResolvedValue([
            { title: "Enquiry", createdAt: new Date("2026-01-01") },
        ]);
        const { events } = await svc.timeline(CTX, "c1");
        // CRM active → lead queried; Commerce/Appointments/Comms disabled → not.
        expect(db.lead.findMany).toHaveBeenCalled();
        expect(db.order.findMany).not.toHaveBeenCalled();
        expect(db.booking.findMany).not.toHaveBeenCalled();
        expect(events.every((e) => e.moduleKey === "CRM")).toBe(true);
    });
});
