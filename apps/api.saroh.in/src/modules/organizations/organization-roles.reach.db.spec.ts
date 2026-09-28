import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { OrganizationContextService } from "./organization-context.service";
import { OrganizationRolesService } from "./organization-roles.service";

/**
 * The role editor stays within reach (F19), against a real database and the
 * context the guard would really resolve: a "Manager" the business handed
 * `member:role:update` to cannot give any role — their own included — a
 * power they don't hold, and cannot touch a role above them. What is stored
 * afterwards is exactly what was there before.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("role editor within reach (DB)", () => {
    const contexts = new OrganizationContextService();
    const roles = new OrganizationRolesService();

    const MANAGER_ACTIONS = [
        "member:read",
        "member:role:update",
        "store:read",
        "store:write",
        "order:read",
    ];
    const users: Record<string, string> = {};
    let orgId = "";

    const asUser = (who: string) => contexts.resolve(users[who]!, orgId);
    const stored = (key: string) =>
        prisma.organizationRole.findUniqueOrThrow({
            where: { organizationId_key: { organizationId: orgId, key } },
            select: { label: true, actions: true },
        });

    beforeAll(async () => {
        for (const who of ["ADMIN", "MANAGER"]) {
            users[who] = (
                await prisma.user.create({
                    data: {
                        email: `reach-${who.toLowerCase()}-${tag}@example.com`,
                    },
                })
            ).id;
        }
        orgId = (
            await prisma.organization.create({
                data: { name: "Reach Org", slug: `reach-${tag}` },
            })
        ).id;
        await prisma.organizationRole.createMany({
            data: [
                {
                    organizationId: orgId,
                    key: "manager",
                    label: "Manager",
                    actions: MANAGER_ACTIONS,
                },
                {
                    organizationId: orgId,
                    key: "senior",
                    label: "Senior",
                    actions: ["order:read", "payment:manage"],
                },
                {
                    organizationId: orgId,
                    key: "counter",
                    label: "Counter",
                    actions: ["order:read", "store:read", "store:write"],
                },
            ],
        });
        await prisma.membership.createMany({
            data: [
                { organizationId: orgId, userId: users.ADMIN!, role: "ADMIN" },
                {
                    organizationId: orgId,
                    userId: users.MANAGER!,
                    role: "manager",
                },
            ],
        });
    });

    it("refuses the Manager adding payment:manage to their own role; the row is unchanged", async () => {
        const manager = await asUser("MANAGER");
        await expect(
            roles.update(manager, "manager", {
                actions: [...MANAGER_ACTIONS, "payment:manage"],
            }),
        ).rejects.toThrow(
            new ForbiddenException(
                "You can't give a role a permission you don't have: Manage payments.",
            ),
        );
        expect((await stored("manager")).actions).toEqual(MANAGER_ACTIONS);
        // And their context resolves exactly as before.
        expect((await asUser("MANAGER")).actions?.has("payment:manage")).toBe(
            false,
        );
    });

    it("refuses the Manager creating a role with a permission they don't hold", async () => {
        const manager = await asUser("MANAGER");
        await expect(
            roles.create(manager, {
                label: "Refunds desk",
                actions: ["order:read", "payment:manage"],
            }),
        ).rejects.toThrow(ForbiddenException);
        expect(
            await prisma.organizationRole.count({
                where: { organizationId: orgId, key: "refunds-desk" },
            }),
        ).toBe(0);
    });

    it("refuses the Manager renaming a role that holds more than them", async () => {
        const manager = await asUser("MANAGER");
        await expect(
            roles.update(manager, "senior", { label: "Senior staff" }),
        ).rejects.toThrow(ForbiddenException);
        expect(await stored("senior")).toEqual({
            label: "Senior",
            actions: ["order:read", "payment:manage"],
        });
    });

    it("lets the Manager take store:write, which they hold, off a role within reach", async () => {
        const manager = await asUser("MANAGER");
        await roles.update(manager, "counter", {
            actions: ["order:read", "store:read"],
        });
        expect((await stored("counter")).actions).toEqual([
            "order:read",
            "store:read",
        ]);
    });

    it("lets an Admin add payment:manage to Counter", async () => {
        const admin = await asUser("ADMIN");
        const out = await roles.update(admin, "counter", {
            actions: ["order:read", "store:read", "payment:manage"],
        });
        expect(out.actions).toContain("payment:manage");
        expect((await stored("counter")).actions).toContain("payment:manage");
    });
});
