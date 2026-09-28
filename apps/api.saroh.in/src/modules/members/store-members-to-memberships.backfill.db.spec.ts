/**
 * The F16 backfill (DEC-048, amended 2026-09-27) against a real Postgres:
 * every storefront member without a membership joins the storefront's
 * business as Storefront team, one Activity entry each; a second run
 * changes nothing; an existing role is never touched; a business whose own
 * "storefront-team" role holds more is left alone; and Team's one-time
 * notice names exactly the people it added, until dismissed or until their
 * role is changed. Runs in the integration project (TEST_DATABASE_URL).
 */
import { ForbiddenException } from "@nestjs/common";
import { backfillStoreMembersToMemberships, prisma } from "@saroh/database";

import { OrganizationContextService } from "../organizations/organization-context.service";
import { StorefrontTeamNoticeService } from "../organizations/storefront-team-notice.service";

const tag = `${process.pid}-${Date.now()}`;
const contexts = new OrganizationContextService();
const notice = new StorefrontTeamNoticeService();

describe("storefront members to memberships (DB, F16 backfill)", () => {
    const users: Record<string, string> = {};
    const orgs: Record<string, string> = {};
    const stores: Record<string, string> = {};

    const user = async (who: string) => {
        users[who] = (
            await prisma.user.create({
                data: {
                    email: `f16b-${who.toLowerCase()}-${tag}@example.com`,
                    name: who,
                },
            })
        ).id;
    };
    const store = async (key: string, org: string, name: string) => {
        stores[key] = (
            await prisma.store.create({
                data: {
                    name,
                    slug: `f16b-${key.toLowerCase()}-${tag}`,
                    organizationId: orgs[org]!,
                },
            })
        ).id;
    };
    const onStore = (key: string, who: string, role: string) =>
        prisma.storeMembers.create({
            data: { storeId: stores[key]!, userId: users[who]!, role },
        });
    const roleOf = async (org: string, who: string) =>
        (
            await prisma.membership.findUnique({
                where: {
                    organizationId_userId: {
                        organizationId: orgs[org]!,
                        userId: users[who]!,
                    },
                },
                select: { role: true },
            })
        )?.role ?? null;

    beforeAll(async () => {
        for (const who of [
            "OWNER",
            "PRIYA",
            "RAVI",
            "MEENA",
            "ADMIN",
            "GONE",
            "WIDE",
            "MEMBER",
        ]) {
            await user(who);
        }
        for (const org of ["NORTHWIND", "WIDENED"]) {
            orgs[org] = (
                await prisma.organization.create({
                    data: {
                        name: org,
                        slug: `f16b-${org.toLowerCase()}-${tag}`,
                    },
                })
            ).id;
        }
        await prisma.membership.createMany({
            data: [
                {
                    organizationId: orgs.NORTHWIND!,
                    userId: users.OWNER!,
                    role: "OWNER",
                },
                {
                    organizationId: orgs.NORTHWIND!,
                    userId: users.ADMIN!,
                    role: "ADMIN",
                },
                {
                    organizationId: orgs.NORTHWIND!,
                    userId: users.MEMBER!,
                    role: "MEMBER",
                },
            ],
        });
        await store("HILL", "NORTHWIND", "Hill Road");
        await store("MARKET", "NORTHWIND", "Market");
        await store("CLOSED", "NORTHWIND", "Old Town");
        await prisma.store.update({
            where: { id: stores.CLOSED! },
            data: { deletedAt: new Date() },
        });
        await store("WIDE_STORE", "WIDENED", "Wide shop");

        await onStore("HILL", "PRIYA", "EDITOR");
        // On two storefronts: one membership, named after the first.
        await onStore("HILL", "RAVI", "VIEWER");
        await onStore("MARKET", "RAVI", "MANAGER");
        await onStore("MARKET", "MEENA", "ADMIN");
        // Already on the team: left as they are.
        await onStore("HILL", "ADMIN", "VIEWER");
        // Only on a closed storefront: nobody to add.
        await onStore("CLOSED", "GONE", "EDITOR");

        // A business that invented "Storefront team" and gave it more.
        await prisma.organizationRole.create({
            data: {
                organizationId: orgs.WIDENED!,
                key: "storefront-team",
                label: "Storefront team",
                actions: ["store:read", "contact:read"],
            },
        });
        await onStore("WIDE_STORE", "WIDE", "VIEWER");
    });

    it("adds each storefront member without a membership, as Storefront team", async () => {
        const report = await backfillStoreMembersToMemberships(prisma);

        expect(report).toEqual({
            organizations: 2,
            people: 5,
            joined: 3,
            alreadyOnTeam: 1,
            skippedOrganizations: 1,
        });
        expect(await roleOf("NORTHWIND", "PRIYA")).toBe("storefront-team");
        expect(await roleOf("NORTHWIND", "RAVI")).toBe("storefront-team");
        expect(await roleOf("NORTHWIND", "MEENA")).toBe("storefront-team");
        // Never lowered or replaced.
        expect(await roleOf("NORTHWIND", "ADMIN")).toBe("ADMIN");
        // A closed storefront adds nobody.
        expect(await roleOf("NORTHWIND", "GONE")).toBeNull();
        // Nobody is put in a role wider than the narrow list.
        expect(await roleOf("WIDENED", "WIDE")).toBeNull();

        const role = await prisma.organizationRole.findUniqueOrThrow({
            where: {
                organizationId_key: {
                    organizationId: orgs.NORTHWIND!,
                    key: "storefront-team",
                },
            },
        });
        expect(role.actions).not.toContain("contact:read");
        expect(role.actions).not.toContain("booking:read");

        const entries = await prisma.auditEvent.findMany({
            where: {
                organizationId: orgs.NORTHWIND!,
                action: "membership.storefront-join",
            },
            orderBy: { targetId: "asc" },
        });
        expect(entries.map((e) => e.targetId).sort()).toEqual(
            [users.PRIYA!, users.RAVI!, users.MEENA!].sort(),
        );
        expect(
            entries.find((e) => e.targetId === users.RAVI)?.metadata,
        ).toEqual({
            role: "storefront-team",
            storeId: stores.HILL,
            storefront: "Hill Road",
            source: "backfill",
        });
    });

    it("changes nothing the second time", async () => {
        const before = await prisma.membership.count();
        const entriesBefore = await prisma.auditEvent.count();

        const report = await backfillStoreMembersToMemberships(prisma);

        expect(report).toMatchObject({ joined: 0, alreadyOnTeam: 4 });
        expect(await prisma.membership.count()).toBe(before);
        expect(await prisma.auditEvent.count()).toBe(entriesBefore);
    });

    it("gives the people it added no customers, bookings, orders or money", async () => {
        const ctx = await contexts.resolve(users.RAVI!, orgs.NORTHWIND!);
        for (const action of [
            "contact:read",
            "booking:read",
            "service:read",
            "order:read",
            "order:stage",
            "payment:read",
            "invoice:read",
        ] as const) {
            expect(ctx.actions?.has(action)).toBe(false);
        }
        expect(ctx.actions?.has("store:read")).toBe(true);
        expect(ctx.actions?.has("member:read")).toBe(true);
    });

    describe("Team's one-time notice", () => {
        const asOwner = () => contexts.resolve(users.OWNER!, orgs.NORTHWIND!);

        it("names exactly the people it added, with their storefronts", async () => {
            const { people } = await notice.read(await asOwner());
            expect(
                people
                    .map((p) => [p.name, p.storefronts])
                    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
            ).toEqual([
                ["MEENA", ["Market"]],
                ["PRIYA", ["Hill Road"]],
                ["RAVI", ["Hill Road", "Market"]],
            ]);
        });

        it("is only for someone who can change their role", async () => {
            const member = await contexts.resolve(
                users.MEMBER!,
                orgs.NORTHWIND!,
            );
            await expect(notice.read(member)).rejects.toBeInstanceOf(
                ForbiddenException,
            );
            const joined = await contexts.resolve(
                users.PRIYA!,
                orgs.NORTHWIND!,
            );
            await expect(notice.dismiss(joined)).rejects.toBeInstanceOf(
                ForbiddenException,
            );
        });

        it("drops someone whose role has been changed", async () => {
            await prisma.membership.update({
                where: {
                    organizationId_userId: {
                        organizationId: orgs.NORTHWIND!,
                        userId: users.MEENA!,
                    },
                },
                data: { role: "MEMBER" },
            });
            const { people } = await notice.read(await asOwner());
            expect(people.map((p) => p.userId).sort()).toEqual(
                [users.PRIYA!, users.RAVI!].sort(),
            );
        });

        it("goes away for the whole business once dismissed", async () => {
            await notice.dismiss(await asOwner());
            expect((await notice.read(await asOwner())).people).toEqual([]);
            const admin = await contexts.resolve(users.ADMIN!, orgs.NORTHWIND!);
            expect((await notice.read(admin)).people).toEqual([]);
        });
    });
});
