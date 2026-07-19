// DB-free unit tests: the database package is mocked so nothing touches a real
// Postgres. Only the contact delegate is exercised here.
jest.mock("@saroh/database", () => {
    return {
        prisma: {
            contact: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                update: jest.fn(),
            },
        },
    };
});

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactsService } from "./contacts.service";

const findMany = prisma.contact.findMany as jest.Mock;
const findUnique = prisma.contact.findUnique as jest.Mock;
const update = prisma.contact.update as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

describe("ContactsService.list", () => {
    beforeEach(() => jest.clearAllMocks());

    it("scopes to the ctx org, newest first", async () => {
        const service = new ContactsService();
        findMany.mockResolvedValue([]);

        await service.list(ctx());

        expect(findMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            orderBy: { createdAt: "desc" },
        });
    });

    it("denies a MEMBER (contact:read is OWNER/ADMIN-only) before any I/O", async () => {
        const service = new ContactsService();
        await expect(
            service.list(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(findMany).not.toHaveBeenCalled();
    });
});

describe("ContactsService.get", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns an owned contact with its leads included", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_1",
            leads: [],
        });

        const res = await service.get(ctx(), "c_1");

        expect(res.id).toBe("c_1");
        expect(findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "c_1" },
                include: expect.objectContaining({
                    leads: expect.any(Object),
                }),
            }),
        );
    });

    it("404s a cross-tenant contact", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_OTHER",
            leads: [],
        });

        await expect(service.get(ctx(), "c_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("404s a missing contact", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue(null);

        await expect(service.get(ctx(), "nope")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe("ContactsService.update", () => {
    beforeEach(() => jest.clearAllMocks());

    it("patches only the supplied fields of an owned contact", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue({ id: "c_1", organizationId: "org_1" });
        update.mockResolvedValue({ id: "c_1" });

        await service.update(ctx(), "c_1", { company: "Acme" });

        expect(update).toHaveBeenCalledWith({
            where: { id: "c_1" },
            data: { company: "Acme" },
        });
    });

    it("404s (and never writes) a cross-tenant contact", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_OTHER",
        });

        await expect(
            service.update(ctx(), "c_1", { company: "Acme" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(update).not.toHaveBeenCalled();
    });

    it("denies a MEMBER (contact:write is OWNER/ADMIN-only) before any I/O", async () => {
        const service = new ContactsService();
        await expect(
            service.update(ctx({ role: "MEMBER" }), "c_1", { company: "Acme" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(findUnique).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });
});
