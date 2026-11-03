import type { ExecutionContext } from "@nestjs/common";
import { NotFoundException } from "@nestjs/common";

jest.mock("@saroh/database", () => ({
    outsideOrgContext: (fn: () => unknown) => fn(),
    prisma: {
        organization: { findUnique: jest.fn() },
        sarohInvoice: { findUnique: jest.fn() },
        subscription: { findUnique: jest.fn() },
        domain: { findUnique: jest.fn() },
        billingAction: { findUnique: jest.fn() },
    },
}));

import { prisma } from "@saroh/database";

import { AdminEditionGuard } from "./admin-edition.guard";

const org = prisma.organization.findUnique as jest.Mock;
const invoice = prisma.sarohInvoice.findUnique as jest.Mock;
const action = prisma.billingAction.findUnique as jest.Mock;

function run(edition: string | null, params: Record<string, string>) {
    const context = {
        switchToHttp: () => ({
            getRequest: () => ({ platformAdmin: { edition }, params }),
        }),
    } as unknown as ExecutionContext;
    return new AdminEditionGuard().canActivate(context);
}

describe("AdminEditionGuard", () => {
    beforeEach(() => jest.clearAllMocks());

    it("hides another edition's business as a 404", async () => {
        org.mockResolvedValue({ edition: "INDIA" });
        await expect(
            run("GLOBAL", { organizationId: "o" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lets its own edition's business through", async () => {
        org.mockResolvedValue({ edition: "GLOBAL" });
        await expect(run("GLOBAL", { organizationId: "o" })).resolves.toBe(
            true,
        );
    });

    it("reads the business behind an invoice", async () => {
        invoice.mockResolvedValue({ organization: { edition: "INDIA" } });
        await expect(run("GLOBAL", { invoiceId: "i" })).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("reads a billing action through its bare business id", async () => {
        action.mockResolvedValue({ organizationId: "o" });
        org.mockResolvedValue({ edition: "INDIA" });
        await expect(run("GLOBAL", { actionId: "a" })).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("leaves a missing row to the route's own 404", async () => {
        org.mockResolvedValue(null);
        await expect(run("GLOBAL", { organizationId: "o" })).resolves.toBe(
            true,
        );
    });

    it("doesn't look anything up on an address of no edition", async () => {
        await expect(run(null, { organizationId: "o" })).resolves.toBe(true);
        expect(org).not.toHaveBeenCalled();
    });
});
