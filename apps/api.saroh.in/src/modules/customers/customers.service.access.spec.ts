import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { StoresService } from "../stores/stores.service";
import { CustomersService } from "./customers.service";

/**
 * Who may read a storefront's customers (R7, #508), on the organization
 * path. The list carries every customer's email and what they have spent, so
 * it takes a read of the store's orders, as the store's order list does: a
 * Member at the counter holds `order:stage` and `store:read` but no money
 * read, and is refused. Owner and Admin read it as before; a role the
 * business invented is let in when it was granted `order:read`.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("store customers access by role (DB)", () => {
    // The organization path is on for this business.
    const flags = {
        isEnabled: () => Promise.resolve(true),
    } as unknown as FeatureFlagService;
    const stores = new StoresService(flags);
    const customers = new CustomersService(stores);

    // "counter-lead": invented, moves the kitchen AND reads orders.
    const roles = ["OWNER", "ADMIN", "MEMBER", "counter-lead"] as const;
    const users: Record<string, string> = {};
    let orgId = "";
    let storeId = "";
    let customerId = "";

    beforeAll(async () => {
        for (const role of roles) {
            users[role] = (
                await prisma.user.create({
                    data: {
                        email: `cust-acc-${role.toLowerCase()}-${tag}@example.com`,
                    },
                })
            ).id;
        }
        orgId = (
            await prisma.organization.create({
                data: { name: "Customer Access Org", slug: `cust-acc-${tag}` },
            })
        ).id;
        await prisma.organizationRole.create({
            data: {
                organizationId: orgId,
                key: "counter-lead",
                label: "Counter lead",
                actions: ["store:read", "order:stage", "order:read"],
            },
        });
        await prisma.membership.createMany({
            data: Object.entries(users).map(([role, userId]) => ({
                organizationId: orgId,
                userId,
                role,
            })),
        });
        storeId = (
            await stores.createForUser(users.OWNER, orgId, {
                name: "Customer Access Store",
                slug: `cust-acc-${tag}`,
            })
        ).id;
        customerId = (
            await customers.create(storeId, users.OWNER, {
                email: `ananya-${tag}@example.com`,
                firstName: "Ananya",
            })
        ).id;
        await prisma.order.create({
            data: {
                storeId,
                organizationId: orgId,
                orderId: "ORD-001",
                customerId,
                subtotal: "1250.00",
                total: "1250.00",
                currency: "INR",
                paymentStatus: "PAID",
            },
        });
    });

    afterAll(async () => {
        await prisma.order.deleteMany({ where: { storeId } });
        await prisma.customer.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.membership.deleteMany({
            where: { organizationId: orgId },
        });
        await prisma.organizationRole.deleteMany({
            where: { organizationId: orgId },
        });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({
            where: { id: { in: Object.values(users) } },
        });
    });

    it("refuses a Member, who moves stages but reads no money", async () => {
        await expect(customers.list(storeId, users.MEMBER)).rejects.toThrow(
            ForbiddenException,
        );
        await expect(
            customers.get(storeId, customerId, users.MEMBER),
        ).rejects.toThrow(ForbiddenException);
    });

    it.each(["OWNER", "ADMIN"])(
        "lets %s read the list, with what each customer spent",
        async (role) => {
            const list = await customers.list(storeId, users[role]);
            expect(list).toHaveLength(1);
            expect(list[0]).toMatchObject({
                id: customerId,
                email: `ananya-${tag}@example.com`,
                orderCount: 1,
                spent: "1250.00",
                currency: "INR",
            });
            const one = await customers.get(storeId, customerId, users[role]);
            expect(one.id).toBe(customerId);
        },
    );

    it("lets an invented role that was granted order:read in", async () => {
        const list = await customers.list(storeId, users["counter-lead"]);
        expect(list.map((c) => c.spent)).toEqual(["1250.00"]);
        const one = await customers.get(
            storeId,
            customerId,
            users["counter-lead"],
        );
        expect(one.id).toBe(customerId);
    });

    it("still answers a stranger with not found, not a refusal", async () => {
        const stranger = (
            await prisma.user.create({
                data: { email: `cust-acc-stranger-${tag}@example.com` },
            })
        ).id;
        users.stranger = stranger;
        await expect(customers.list(storeId, stranger)).rejects.toThrow(
            NotFoundException,
        );
    });
});
