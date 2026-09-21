// Roles a business invents: what may be created, what may never be written,
// and what happens to the people holding a role.
jest.mock("@saroh/database", () => ({
    prisma: {
        organizationRole: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        membership: {
            groupBy: jest.fn(),
            count: jest.fn(),
        },
    },
}));

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { OrganizationRolesService } from "./organization-roles.service";

const role = prisma.organizationRole as unknown as Record<string, jest.Mock>;
const membership = prisma.membership as unknown as Record<string, jest.Mock>;

const service = () => new OrganizationRolesService();

const STOCK_CLERK = {
    id: "role_1",
    organizationId: "org_1",
    key: "stock-clerk",
    label: "Stock clerk",
    actions: ["order:read"],
    ringTone: "moss",
    system: false,
};

beforeEach(() => {
    jest.clearAllMocks();
    role.findMany!.mockResolvedValue([]);
    role.findUnique!.mockResolvedValue(null);
    membership.groupBy!.mockResolvedValue([]);
    membership.count!.mockResolvedValue(0);
});

describe("list", () => {
    it("always includes the four built-ins, even with nothing stored", async () => {
        // A business that has never opened this screen still has to see the
        // roles its people actually hold.
        const roles = await service().list("org_1");
        expect(roles.map((r) => r.key)).toEqual([
            "OWNER",
            "ADMIN",
            "MEMBER",
            "REVIEWER",
        ]);
        expect(roles.every((r) => r.system)).toBe(true);
    });

    it("gives built-ins the shipped permissions even if a row says otherwise", async () => {
        role.findMany!.mockResolvedValue([
            {
                ...STOCK_CLERK,
                key: "MEMBER",
                label: "Staff",
                actions: ["org:delete"],
            },
        ]);
        const member = (await service().list("org_1")).find(
            (r) => r.key === "MEMBER",
        )!;
        // A stored built-in is a rename at most.
        expect(member.label).toBe("Staff");
        expect(member.actions).not.toContain("org:delete");
        expect(member.actions).toContain("member:read");
    });

    it("lists invented roles after the built-ins, with who holds them", async () => {
        role.findMany!.mockResolvedValue([STOCK_CLERK]);
        membership.groupBy!.mockResolvedValue([
            { role: "stock-clerk", _count: { role: 2 } },
            { role: "OWNER", _count: { role: 1 } },
        ]);
        const roles = await service().list("org_1");
        const clerk = roles.at(-1)!;
        expect(clerk).toMatchObject({
            key: "stock-clerk",
            system: false,
            members: 2,
            actions: ["order:read"],
        });
        expect(roles[0]!.members).toBe(1);
    });
});

describe("create", () => {
    it("slugs the name into a stable key", async () => {
        role.create!.mockImplementation(({ data }) => ({
            ...STOCK_CLERK,
            ...data,
        }));
        const created = await service().create("org_1", {
            label: "  Stock Clerk ",
            actions: ["order:read"],
        });
        expect(role.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: "org_1",
                key: "stock-clerk",
                label: "Stock Clerk",
            }),
        });
        expect(created.system).toBe(false);
    });

    it("refuses a name that is one of the four every business has", async () => {
        await expect(
            service().create("org_1", { label: "Owner", actions: [] }),
        ).rejects.toThrow(BadRequestException);
        expect(role.create).not.toHaveBeenCalled();
    });

    it("refuses a name the business already uses", async () => {
        role.findUnique!.mockResolvedValue({ id: "role_1" });
        await expect(
            service().create("org_1", { label: "Stock clerk", actions: [] }),
        ).rejects.toThrow(/already has a role/);
    });

    it("refuses a name with nothing usable in it", async () => {
        await expect(
            service().create("org_1", { label: "   ", actions: [] }),
        ).rejects.toThrow(BadRequestException);
        await expect(
            service().create("org_1", { label: "!!!", actions: [] }),
        ).rejects.toThrow(BadRequestException);
    });

    it("never stores closing the business, however it was asked for", async () => {
        role.create!.mockImplementation(({ data }) => ({
            ...STOCK_CLERK,
            ...data,
        }));
        await service().create("org_1", {
            label: "Deputy",
            actions: ["org:delete", "org:update"],
        });
        const stored = role.create!.mock.calls[0][0].data.actions;
        expect(stored).toEqual(["org:update"]);
    });

    it("drops unknown and repeated permissions rather than failing the save", async () => {
        role.create!.mockImplementation(({ data }) => ({
            ...STOCK_CLERK,
            ...data,
        }));
        await service().create("org_1", {
            label: "Deputy",
            actions: ["order:read", "order:read", "order:teleport"],
        });
        expect(role.create!.mock.calls[0][0].data.actions).toEqual([
            "order:read",
        ]);
    });
});

describe("update and remove refuse built-ins", () => {
    it.each(["OWNER", "ADMIN", "MEMBER", "REVIEWER"])(
        "will not change %s",
        async (key) => {
            await expect(
                service().update("org_1", key, { actions: ["org:delete"] }),
            ).rejects.toThrow(ForbiddenException);
            await expect(service().remove("org_1", key)).rejects.toThrow(
                ForbiddenException,
            );
            expect(role.update).not.toHaveBeenCalled();
            expect(role.delete).not.toHaveBeenCalled();
        },
    );

    it("404s a role this business does not have", async () => {
        await expect(
            service().update("org_1", "ghost", { label: "x" }),
        ).rejects.toThrow(NotFoundException);
    });
});

describe("update", () => {
    it("changes only what was sent, and vets the permissions", async () => {
        role.findUnique!.mockResolvedValue(STOCK_CLERK);
        role.update!.mockImplementation(({ data }) => ({
            ...STOCK_CLERK,
            ...data,
        }));
        await service().update("org_1", "stock-clerk", {
            actions: ["order:write", "org:delete"],
        });
        expect(role.update).toHaveBeenCalledWith({
            where: { id: "role_1" },
            data: { actions: ["order:write"] },
        });
    });
});

describe("remove", () => {
    it("refuses while anyone still holds the role", async () => {
        // The membership would survive — but silently shrinking someone's
        // permissions is not something to do behind their back.
        role.findUnique!.mockResolvedValue(STOCK_CLERK);
        membership.count!.mockResolvedValue(2);
        await expect(service().remove("org_1", "stock-clerk")).rejects.toThrow(
            /2 people still hold this role/,
        );
        expect(role.delete).not.toHaveBeenCalled();
    });

    it("says it in the singular for one person", async () => {
        role.findUnique!.mockResolvedValue(STOCK_CLERK);
        membership.count!.mockResolvedValue(1);
        await expect(service().remove("org_1", "stock-clerk")).rejects.toThrow(
            /One person still holds/,
        );
    });

    it("removes a role nobody holds", async () => {
        role.findUnique!.mockResolvedValue(STOCK_CLERK);
        await service().remove("org_1", "stock-clerk");
        expect(role.delete).toHaveBeenCalledWith({ where: { id: "role_1" } });
    });
});
