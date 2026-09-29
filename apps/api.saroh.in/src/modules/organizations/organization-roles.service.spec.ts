// Roles a business invents: what may be created, what may never be written,
// what happens to the people holding a role, and who may write it (F19).
jest.mock("@saroh/database", () => ({
    prisma: {
        organizationRole: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn(),
            deleteMany: jest.fn(),
        },
        membership: {
            groupBy: jest.fn(),
            count: jest.fn(),
        },
    },
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { resolveCapabilities } from "./organization-policy";
import { OrganizationRolesService } from "./organization-roles.service";

const role = prisma.organizationRole as unknown as Record<string, jest.Mock>;
const membership = prisma.membership as unknown as Record<string, jest.Mock>;

const service = () => new OrganizationRolesService();

const SAVED_AT = new Date("2026-09-01T10:00:00Z");

const STOCK_CLERK = {
    id: "role_1",
    organizationId: "org_1",
    key: "stock-clerk",
    label: "Stock clerk",
    actions: ["order:read"],
    ringTone: "moss",
    system: false,
    updatedAt: SAVED_AT,
};

/** A built-in actor, resolved from the shipped map as the guard would. */
function asBuiltIn(builtIn: OrgRole): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: `user_${builtIn.toLowerCase()}`,
        role: builtIn,
        roleKey: builtIn,
        actions: resolveCapabilities(builtIn),
    };
}

const OWNER = asBuiltIn("OWNER");
const ADMIN = asBuiltIn("ADMIN");

/**
 * The plan's "Manager": a role the business invented and handed the role
 * editor to, without any money.
 */
const MANAGER_ACTIONS = [
    "member:read",
    "member:role:update",
    "store:read",
    "store:write",
    "order:read",
];
const MANAGER: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_manager",
    role: "MEMBER",
    roleKey: "manager",
    actions: resolveCapabilities("manager", MANAGER_ACTIONS),
};

const MANAGER_ROLE = {
    ...STOCK_CLERK,
    id: "role_manager",
    key: "manager",
    label: "Manager",
    actions: MANAGER_ACTIONS,
};
const SENIOR_ROLE = {
    ...STOCK_CLERK,
    id: "role_senior",
    key: "senior",
    label: "Senior",
    actions: ["order:read", "payment:manage"],
};
const COUNTER_ROLE = {
    ...STOCK_CLERK,
    id: "role_counter",
    key: "counter",
    label: "Counter",
    actions: ["order:read", "store:read", "store:write"],
};

/**
 * The business holds `row`. `updateMany` writes into it, so reading it back
 * returns what was saved — and a role that is never written stays as it was.
 */
function stored(row: typeof STOCK_CLERK) {
    let current = { ...row };
    role.findUnique!.mockImplementation(() => Promise.resolve(current));
    role.updateMany!.mockImplementation(
        ({ data }: { data: Partial<typeof STOCK_CLERK> }) => {
            current = { ...current, ...data };
            return Promise.resolve({ count: 1 });
        },
    );
    return () => current;
}

beforeEach(() => {
    jest.clearAllMocks();
    role.findMany!.mockResolvedValue([]);
    role.findUnique!.mockResolvedValue(null);
    role.create!.mockImplementation(({ data }) => ({
        ...STOCK_CLERK,
        ...data,
    }));
    role.updateMany!.mockResolvedValue({ count: 1 });
    role.deleteMany!.mockResolvedValue({ count: 1 });
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
        const created = await service().create(OWNER, {
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
            service().create(OWNER, { label: "Owner", actions: [] }),
        ).rejects.toThrow(BadRequestException);
        expect(role.create).not.toHaveBeenCalled();
    });

    it("refuses a name the business already uses", async () => {
        role.findUnique!.mockResolvedValue({ id: "role_1" });
        await expect(
            service().create(OWNER, { label: "Stock clerk", actions: [] }),
        ).rejects.toThrow(/already has a role/);
    });

    it("refuses a name with nothing usable in it", async () => {
        await expect(
            service().create(OWNER, { label: "   ", actions: [] }),
        ).rejects.toThrow(BadRequestException);
        await expect(
            service().create(OWNER, { label: "!!!", actions: [] }),
        ).rejects.toThrow(BadRequestException);
    });

    it("never stores closing the business, however it was asked for", async () => {
        // Even the Owner, who holds it: it is not grantable at all.
        await service().create(OWNER, {
            label: "Deputy",
            actions: ["org:delete", "org:update"],
        });
        const stored = role.create!.mock.calls[0][0].data.actions;
        expect(stored).toEqual(["org:update"]);
    });

    it("drops unknown and repeated permissions rather than failing the save", async () => {
        await service().create(OWNER, {
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
                service().update(OWNER, key, { actions: ["org:delete"] }),
            ).rejects.toThrow(ForbiddenException);
            await expect(service().remove(OWNER, key)).rejects.toThrow(
                ForbiddenException,
            );
            expect(role.updateMany).not.toHaveBeenCalled();
            expect(role.deleteMany).not.toHaveBeenCalled();
        },
    );

    it("404s a role this business does not have", async () => {
        await expect(
            service().update(OWNER, "ghost", { label: "x" }),
        ).rejects.toThrow(NotFoundException);
    });
});

describe("update", () => {
    it("changes only what was sent, and vets the permissions", async () => {
        stored(STOCK_CLERK);
        await service().update(OWNER, "stock-clerk", {
            actions: ["order:write", "org:delete"],
        });
        expect(role.updateMany).toHaveBeenCalledWith({
            where: { id: "role_1", updatedAt: SAVED_AT },
            data: { actions: ["order:write"] },
        });
    });

    it("returns the role as it was saved", async () => {
        stored(STOCK_CLERK);
        const out = await service().update(OWNER, "stock-clerk", {
            label: " Stock lead ",
        });
        expect(out).toMatchObject({
            key: "stock-clerk",
            label: "Stock lead",
            actions: ["order:read"],
        });
    });

    it("refuses a save when someone else saved the role since it was read", async () => {
        role.findUnique!.mockResolvedValue(STOCK_CLERK);
        role.updateMany!.mockResolvedValue({ count: 0 });
        await expect(
            service().update(OWNER, "stock-clerk", { label: "Stock lead" }),
        ).rejects.toThrow(ConflictException);
    });
});

describe("remove", () => {
    it("refuses while anyone still holds the role", async () => {
        // The membership would survive — but silently shrinking someone's
        // permissions is not something to do behind their back.
        role.findUnique!.mockResolvedValue(STOCK_CLERK);
        membership.count!.mockResolvedValue(2);
        await expect(service().remove(OWNER, "stock-clerk")).rejects.toThrow(
            /2 people still hold this role/,
        );
        expect(role.deleteMany).not.toHaveBeenCalled();
    });

    it("says it in the singular for one person", async () => {
        role.findUnique!.mockResolvedValue(STOCK_CLERK);
        membership.count!.mockResolvedValue(1);
        await expect(service().remove(OWNER, "stock-clerk")).rejects.toThrow(
            /One person still holds/,
        );
    });

    it("removes a role nobody holds", async () => {
        role.findUnique!.mockResolvedValue(STOCK_CLERK);
        await service().remove(OWNER, "stock-clerk");
        expect(role.deleteMany).toHaveBeenCalledWith({
            where: { id: "role_1", updatedAt: SAVED_AT },
        });
    });

    it("refuses when the role changed after it was read", async () => {
        role.findUnique!.mockResolvedValue(STOCK_CLERK);
        role.deleteMany!.mockResolvedValue({ count: 0 });
        await expect(service().remove(OWNER, "stock-clerk")).rejects.toThrow(
            ConflictException,
        );
    });
});

/*
 * F19. Before it, a custom "Manager" holding `member:role:update` could add
 * `payment:manage` to their own role and it saved (pinned first, then
 * flipped). Nobody may now give a role a power they don't hold, or touch a
 * role that can already do more than they can.
 */
describe("within reach (F19)", () => {
    it("refuses a Manager adding payment:manage to their own role, and leaves it unchanged", async () => {
        const current = stored(MANAGER_ROLE);
        await expect(
            service().update(MANAGER, "manager", {
                actions: [...MANAGER_ACTIONS, "payment:manage"],
            }),
        ).rejects.toThrow(
            "You can't give a role a permission you don't have: Manage payments.",
        );
        expect(role.updateMany).not.toHaveBeenCalled();
        expect(current().actions).toEqual(MANAGER_ACTIONS);
    });

    it("refuses the Manager creating a role with a permission they don't hold", async () => {
        await expect(
            service().create(MANAGER, {
                label: "Refunds",
                actions: ["order:read", "payment:manage"],
            }),
        ).rejects.toThrow(ForbiddenException);
        expect(role.create).not.toHaveBeenCalled();
    });

    it("names every permission the writer is missing, in the owner's words", async () => {
        await expect(
            service().create(MANAGER, {
                label: "Books",
                actions: ["invoice:write", "payment:manage", "order:read"],
            }),
        ).rejects.toThrow(
            /you don't have: Issue, void and mark invoices paid, Manage payments\.$/,
        );
    });

    it("refuses the Manager editing a role that holds more than them, even to rename it", async () => {
        const current = stored(SENIOR_ROLE);
        await expect(
            service().update(MANAGER, "senior", { label: "Senior staff" }),
        ).rejects.toThrow(
            "You can't change a role that can do more than you can: Manage payments, Refund and cancel orders.",
        );
        await expect(
            service().update(MANAGER, "senior", {
                actions: ["order:read"],
            }),
        ).rejects.toThrow(ForbiddenException);
        expect(role.updateMany).not.toHaveBeenCalled();
        expect(current()).toMatchObject({
            label: "Senior",
            actions: ["order:read", "payment:manage"],
        });
    });

    it("refuses the Manager removing a role that holds more than them", async () => {
        role.findUnique!.mockResolvedValue(SENIOR_ROLE);
        await expect(service().remove(MANAGER, "senior")).rejects.toThrow(
            "You can't remove a role that can do more than you can: Manage payments, Refund and cancel orders.",
        );
        expect(role.deleteMany).not.toHaveBeenCalled();
    });

    it("lets an Admin add payment:manage to Counter", async () => {
        const current = stored(COUNTER_ROLE);
        await service().update(ADMIN, "counter", {
            actions: [...COUNTER_ROLE.actions, "payment:manage"],
        });
        expect(current().actions).toContain("payment:manage");
    });

    it("lets the Manager take away a permission they hold from a role within reach", async () => {
        const current = stored(COUNTER_ROLE);
        const out = await service().update(MANAGER, "counter", {
            actions: ["order:read", "store:read"],
        });
        expect(out.actions).toEqual(["order:read", "store:read"]);
        expect(current().actions).toEqual(["order:read", "store:read"]);
    });

    it("lets the Manager edit their own role within the same rule", async () => {
        const current = stored(MANAGER_ROLE);
        await service().update(MANAGER, "manager", {
            label: "Shop manager",
            actions: MANAGER_ACTIONS.filter((a) => a !== "store:write"),
        });
        expect(current()).toMatchObject({ label: "Shop manager" });
        expect(current().actions).not.toContain("store:write");
    });

    it("lets the Manager create a role from what they hold, implied holds included", async () => {
        // `store:write` implies `inventory:write`; holding the first means
        // the Manager holds the second, so granting it is within reach.
        await service().create(MANAGER, {
            label: "Stock clerk",
            actions: ["store:read", "inventory:write"],
        });
        expect(role.create!.mock.calls[0][0].data.actions).toEqual([
            "store:read",
            "inventory:write",
        ]);
    });

    it("counts what a permission brings with it against the writer", async () => {
        // A clerk who may count stock but not change storefronts can't hand
        // out `store:write`, whose implied `inventory:write` they do hold.
        const clerk: OrganizationContext = {
            ...MANAGER,
            roleKey: "stock-clerk",
            actions: resolveCapabilities("stock-clerk", [
                "member:role:update",
                "inventory:write",
            ]),
        };
        await expect(
            service().create(clerk, {
                label: "Shopfront",
                actions: ["store:write"],
            }),
        ).rejects.toThrow(/you don't have: Change storefronts\.$/);
    });

    it("leaves the Owner unaffected: everything grantable is within reach", async () => {
        const current = stored(STOCK_CLERK);
        await service().update(OWNER, "stock-clerk", {
            actions: [
                "payment:manage",
                "invoice:write",
                "member:role:update",
                "org:update",
            ],
        });
        expect(current().actions).toHaveLength(4);
    });
});
