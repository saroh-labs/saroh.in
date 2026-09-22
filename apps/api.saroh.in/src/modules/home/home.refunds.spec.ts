import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { OrgAction } from "../organizations/organization-actions";
import { HomeService } from "./home.service";

/**
 * Home's "refund a payment taken on a settled invoice" (ADR-007, U13): money
 * that came in through a pay link after the invoice was already paid or
 * voided is owed back, and Home is where a merchant is told what is wrong.
 */
const OWED = {
    id: "pi_1",
    amountCents: 120000,
    currency: "INR",
    updatedAt: new Date("2026-09-10T08:00:00Z"),
    invoice: {
        id: "inv_1",
        number: "INV-0004",
        status: "VOID",
        billToName: "Asha Rao",
    },
};

function build(rows: (typeof OWED)[], count = rows.length) {
    const availability = {
        listViews: jest.fn().mockResolvedValue([
            {
                key: "PAYMENTS",
                label: "Payments",
                readiness: "ACTIVE",
                blockers: [],
            },
        ]),
    } as unknown as ModuleAvailabilityService;
    const db = {
        paymentIntent: {
            count: jest.fn().mockResolvedValue(count),
            findMany: jest.fn().mockResolvedValue(rows),
        },
    };
    return { service: new HomeService(availability, db as never), db };
}

const OWNER = { organizationId: "org_1", organizationRole: "OWNER" as const };

describe("HomeService refunds owed on invoices", () => {
    it("raises an ATTENTION action with the invoice behind it", async () => {
        const { service, db } = build([OWED]);
        const home = await service.build(OWNER);

        expect(home.primaryAction).toEqual({
            code: "PAYMENTS_REFUNDS_OWED",
            title: "Refund a payment taken on a settled invoice",
            href: "/billing/invoices/inv_1",
            severity: "ATTENTION",
            moduleKey: "PAYMENTS",
            count: 1,
            evidence: [
                {
                    id: "pi_1",
                    title: "INV-0004",
                    subtitle: "Asha Rao · Paid online after it was voided",
                    at: "2026-09-10T08:00:00.000Z",
                    amountMinor: 120000,
                    currency: "INR",
                    href: "/billing/invoices/inv_1",
                },
            ],
        });
        // Captured-not-applied, and not already refunded or being refunded.
        expect(db.paymentIntent.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                invoiceId: { not: null },
                status: "SUCCEEDED",
                attempts: { some: { status: "CAPTURED_NEEDS_REFUND" } },
                refunds: {
                    none: { status: { in: ["PENDING", "SUCCEEDED"] } },
                },
            },
        });
    });

    it("points at the invoice list when there are several", async () => {
        const { service } = build([OWED], 3);
        const home = await service.build(OWNER);
        expect(home.primaryAction?.title).toBe(
            "Refund 3 payments taken on settled invoices",
        );
        expect(home.primaryAction?.href).toBe("/billing/invoices");
    });

    it("says nothing when nothing is owed", async () => {
        const { service } = build([]);
        const home = await service.build(OWNER);
        expect(home.actions).toEqual([]);
    });

    it("is not shown to someone who cannot read invoices", async () => {
        const { service, db } = build([OWED]);
        const home = await service.build({
            organizationId: "org_1",
            organizationRole: "MEMBER",
            organizationActions: new Set<OrgAction>(["booking:read"]),
        });
        expect(home.actions).toEqual([]);
        expect(db.paymentIntent.count).not.toHaveBeenCalled();
    });
});
