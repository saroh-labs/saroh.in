/**
 * Storefront people join the team (F16, DEC-048 amended 2026-09-27),
 * against a real Postgres and the context the guard would really resolve.
 *
 * Characterisation first: what each storefront role reaches through the
 * storefront grants, on both authorization paths, before and after joining
 * — the same, no more and no less. Then the join itself: accepting a
 * storefront invite makes a "Storefront team" membership (never a Member),
 * which can't open Customers, a contact, Bookings or an order; an existing
 * role is never lowered; removing someone from Team removes their
 * storefront roles; and a storefront invite needs `member:invite`, within
 * the inviter's reach. Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import { BookingsService } from "../bookings/bookings.service";
import { ContactsService } from "../contacts/contacts.service";
import type { ListCustomersQueryDto } from "../customer-workspace/customers-list.dto";
import { CustomersListService } from "../customer-workspace/customers-list.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrderKitchenService } from "../orders/order-kitchen.service";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { OrganizationMembersService } from "../organizations/organization-members.service";
import { allows } from "../organizations/organization-policy";
import { OrganizationRolesService } from "../organizations/organization-roles.service";
import { StoresService } from "../stores/stores.service";
import { MembersService } from "./members.service";

const tag = `${process.pid}-${Date.now()}`;

/** A flag service with ORG_AUTHORIZATION forced one way. */
const flags = (on: boolean) =>
    ({
        isEnabled: jest.fn().mockResolvedValue(on),
    }) as unknown as FeatureFlagService;

const legacyStores = new StoresService(flags(false));
const orgStores = new StoresService(flags(true));
const contexts = new OrganizationContextService();
const members = new MembersService(contexts);
const team = new OrganizationMembersService(new AuditService());
const roles = new OrganizationRolesService();

const STOREFRONT_ROLES = ["ADMIN", "MANAGER", "EDITOR", "VIEWER"] as const;

describe("storefront people join the team (DB, F16)", () => {
    const users: Record<string, string> = {};
    const emails: Record<string, string> = {};
    let orgId = "";
    let storeId = "";
    let otherStoreId = "";
    let contactId = "";
    let orderId = "";

    const user = async (who: string) => {
        emails[who] = `f16-${who.toLowerCase()}-${tag}@example.com`;
        users[who] = (
            await prisma.user.create({ data: { email: emails[who]! } })
        ).id;
        return users[who]!;
    };
    const as = (who: string): Promise<OrganizationContext> =>
        contexts.resolve(users[who]!, orgId);
    const membershipOf = (who: string) =>
        prisma.membership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId: orgId,
                    userId: users[who]!,
                },
            },
            select: { role: true },
        });

    /** Invite `who` to Hill Road as `role` and accept it as them. */
    const inviteAndAccept = async (
        who: string,
        role: (typeof STOREFRONT_ROLES)[number],
        store = storeId,
    ) => {
        await members.createInvitation(store, users.OWNER!, emails[who]!, role);
        const invite = await prisma.storeInvitation.findFirstOrThrow({
            where: { storeId: store, email: emails[who]! },
        });
        return members.acceptInvitation(invite.token, {
            id: users[who]!,
            email: emails[who]!,
        });
    };

    beforeAll(async () => {
        for (const who of [
            "OWNER",
            ...STOREFRONT_ROLES,
            "ADMIN_ALREADY",
            "MEMBER_ALREADY",
            "CLERK",
            "LEGACY",
            "INVITER",
            "JOINER",
            "LEAVER",
        ]) {
            await user(who);
        }
        orgId = (
            await prisma.organization.create({
                data: { name: "Northwind", slug: `f16-${tag}` },
            })
        ).id;
        await prisma.membership.create({
            data: {
                organizationId: orgId,
                userId: users.OWNER!,
                role: "OWNER",
            },
        });
        storeId = (
            await legacyStores.createForUser(users.OWNER!, orgId, {
                name: "Hill Road",
                slug: `f16-hill-${tag}`,
            })
        ).id;
        otherStoreId = (
            await legacyStores.createForUser(users.OWNER!, orgId, {
                name: "Market",
                slug: `f16-market-${tag}`,
            })
        ).id;
        contactId = (
            await prisma.contact.create({
                data: {
                    organizationId: orgId,
                    firstName: "Asha",
                    email: `asha-${tag}@example.com`,
                },
            })
        ).id;
        const customer = await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `asha-${tag}@example.com`,
                firstName: "Asha",
            },
        });
        orderId = (
            await prisma.order.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    orderId: `F16-${tag}`,
                    customerId: customer.id,
                    subtotal: "100",
                    total: "100",
                    currency: "INR",
                },
            })
        ).id;
    });

    describe("characterisation: a storefront role through the storefront grants", () => {
        // Before F16, a storefront member had no membership. What they reach
        // comes from StoreMembers alone: every role reads, Viewer can't write.
        it("a legacy storefront member with no membership reads, and writes unless a Viewer", async () => {
            for (const role of STOREFRONT_ROLES) {
                const id = users.LEGACY!;
                await prisma.storeMembers.upsert({
                    where: { storeId_userId: { storeId, userId: id } },
                    create: { storeId, userId: id, role },
                    update: { role },
                });
                for (const stores of [legacyStores, orgStores]) {
                    await expect(
                        stores.getForUser(storeId, id),
                    ).resolves.toMatchObject({ id: storeId });
                    expect(await stores.canWrite(storeId, id)).toBe(
                        role !== "VIEWER",
                    );
                    // Another storefront of the business: not theirs.
                    await expect(
                        stores.getForUser(otherStoreId, id),
                    ).rejects.toBeInstanceOf(NotFoundException);
                }
            }
            await prisma.storeMembers.deleteMany({
                where: { userId: users.LEGACY! },
            });
        });
    });

    describe("accepting a storefront invite", () => {
        it("puts each storefront role on the team as Storefront team, and tells the owner", async () => {
            for (const role of STOREFRONT_ROLES) {
                await inviteAndAccept(role, role);
                expect(await membershipOf(role)).toEqual({
                    role: "storefront-team",
                });
            }
            const role = await prisma.organizationRole.findUniqueOrThrow({
                where: {
                    organizationId_key: {
                        organizationId: orgId,
                        key: "storefront-team",
                    },
                },
            });
            expect(role.label).toBe("Storefront team");
            expect([...role.actions].sort()).toEqual(
                [
                    "media:read",
                    "member:read",
                    "module:read",
                    "org:read",
                    "product-review:read",
                    "store:read",
                ].sort(),
            );

            // On Team, with their storefront role under their name.
            const roster = await team.list(await as("OWNER"));
            const editor = roster.find((m) => m.userId === users.EDITOR);
            expect(editor).toMatchObject({
                roleKey: "storefront-team",
                storefronts: [{ storeId, name: "Hill Road", role: "EDITOR" }],
            });

            // One Activity entry per person, naming the storefront.
            const entries = await prisma.auditEvent.findMany({
                where: {
                    organizationId: orgId,
                    action: "membership.storefront-join",
                },
            });
            expect(entries).toHaveLength(STOREFRONT_ROLES.length);
            expect(
                entries.find((e) => e.targetId === users.EDITOR)?.metadata,
            ).toEqual({
                role: "storefront-team",
                storeId,
                storefront: "Hill Road",
                source: "invite",
            });
        });

        it("keeps exactly what each storefront role reached, on both paths", async () => {
            for (const role of STOREFRONT_ROLES) {
                const id = users[role]!;
                for (const stores of [legacyStores, orgStores]) {
                    await expect(
                        stores.getForUser(storeId, id),
                    ).resolves.toMatchObject({ id: storeId });
                    expect(await stores.canWrite(storeId, id)).toBe(
                        role !== "VIEWER",
                    );
                }
                // Managing the storefront's people stays the storefront
                // owner's: joining the team gives no one that.
                await expect(
                    members.createInvitation(
                        storeId,
                        id,
                        `x-${tag}@example.com`,
                        "VIEWER",
                    ),
                ).rejects.toBeInstanceOf(NotFoundException);
            }
        });

        it("can't open Customers, a contact, Bookings or an order", async () => {
            const ctx = await as("VIEWER");
            for (const action of [
                "contact:read",
                "booking:read",
                "service:read",
                "order:read",
                "order:stage",
                "payment:read",
                "invoice:read",
                "subscription:read",
            ] as const) {
                expect(allows(ctx, action)).toBe(false);
            }
            await expect(
                new CustomersListService().list(
                    ctx,
                    {} as ListCustomersQueryDto,
                ),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                new ContactsService().get(ctx, contactId),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                new BookingsService().listBookings(ctx),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                new OrderKitchenService().read(ctx, orderId),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("never lowers or replaces a role someone already holds", async () => {
            await prisma.membership.createMany({
                data: [
                    {
                        organizationId: orgId,
                        userId: users.ADMIN_ALREADY!,
                        role: "ADMIN",
                    },
                    {
                        organizationId: orgId,
                        userId: users.MEMBER_ALREADY!,
                        role: "MEMBER",
                    },
                ],
            });
            await inviteAndAccept("ADMIN_ALREADY", "VIEWER");
            await inviteAndAccept("MEMBER_ALREADY", "EDITOR");

            expect(await membershipOf("ADMIN_ALREADY")).toEqual({
                role: "ADMIN",
            });
            expect(await membershipOf("MEMBER_ALREADY")).toEqual({
                role: "MEMBER",
            });
            // Nothing to tell the owner: nobody joined.
            expect(
                await prisma.auditEvent.count({
                    where: {
                        action: "membership.storefront-join",
                        targetId: {
                            in: [users.ADMIN_ALREADY!, users.MEMBER_ALREADY!],
                        },
                    },
                }),
            ).toBe(0);
        });
    });

    describe("a storefront invite needs the team's invite", () => {
        it("refuses a storefront owner without member:invite", async () => {
            // A storefront's owner whose business role can't invite.
            await prisma.storeOwner.create({
                data: { storeId, userId: users.CLERK!, role: "OWNER" },
            });
            await prisma.membership.create({
                data: {
                    organizationId: orgId,
                    userId: users.CLERK!,
                    role: "MEMBER",
                },
            });
            await expect(
                members.createInvitation(
                    storeId,
                    users.CLERK!,
                    `new-${tag}@example.com`,
                    "VIEWER",
                ),
            ).rejects.toThrow(/can't invite people to the team/);
            expect(
                await prisma.storeInvitation.count({
                    where: { email: `new-${tag}@example.com` },
                }),
            ).toBe(0);
        });

        it("refuses one whose reach doesn't cover a widened Storefront team", async () => {
            await prisma.organizationRole.create({
                data: {
                    organizationId: orgId,
                    key: "clerk",
                    label: "Clerk",
                    actions: ["member:read", "member:invite", "store:read"],
                },
            });
            await prisma.membership.update({
                where: {
                    organizationId_userId: {
                        organizationId: orgId,
                        userId: users.CLERK!,
                    },
                },
                data: { role: "clerk" },
            });
            // The clerk holds none of org:read, module:read, media:read or
            // product-review:read, which Storefront team does.
            await expect(
                members.createInvitation(
                    storeId,
                    users.CLERK!,
                    `new-${tag}@example.com`,
                    "VIEWER",
                ),
            ).rejects.toThrow(/can do more than you can/);

            // Given all of it, the same invite goes out.
            await prisma.organizationRole.update({
                where: {
                    organizationId_key: { organizationId: orgId, key: "clerk" },
                },
                data: {
                    actions: [
                        "org:read",
                        "member:read",
                        "member:invite",
                        "module:read",
                        "media:read",
                        "store:read",
                        "product-review:read",
                    ],
                },
            });
            await expect(
                members.createInvitation(
                    storeId,
                    users.CLERK!,
                    `new-${tag}@example.com`,
                    "VIEWER",
                ),
            ).resolves.toMatchObject({ status: "PENDING" });
        });
    });

    describe("the Storefront team role", () => {
        it("can't be deleted while anyone holds it", async () => {
            await expect(
                roles.remove(await as("OWNER"), "storefront-team"),
            ).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe("removing someone from Team", () => {
        it("removes their storefront roles in this business", async () => {
            // On a second storefront too.
            await prisma.storeMembers.create({
                data: {
                    storeId: otherStoreId,
                    userId: users.MANAGER!,
                    role: "VIEWER",
                },
            });
            const result = await team.remove(await as("OWNER"), users.MANAGER!);
            expect(result).toMatchObject({ removed: true, storefrontRoles: 2 });
            expect(
                await prisma.storeMembers.count({
                    where: { userId: users.MANAGER! },
                }),
            ).toBe(0);
            await expect(
                legacyStores.getForUser(storeId, users.MANAGER!),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it("still can't remove the last owner, and leaves their storefronts alone", async () => {
            await prisma.storeMembers.create({
                data: {
                    storeId: otherStoreId,
                    userId: users.OWNER!,
                    role: "ADMIN",
                },
            });
            await expect(
                team.remove(await as("OWNER"), users.OWNER!),
            ).rejects.toThrow(/only owner/);
            expect(await membershipOf("OWNER")).toEqual({ role: "OWNER" });
            expect(
                await prisma.storeMembers.count({
                    where: { userId: users.OWNER! },
                }),
            ).toBe(1);
        });
    });

    describe("an invite is checked again when it is accepted", () => {
        it("refuses one whose inviter can no longer bring people onto the team", async () => {
            await prisma.storeOwner.create({
                data: {
                    storeId: otherStoreId,
                    userId: users.INVITER!,
                    role: "OWNER",
                },
            });
            await prisma.membership.create({
                data: {
                    organizationId: orgId,
                    userId: users.INVITER!,
                    role: "ADMIN",
                },
            });
            await members.createInvitation(
                otherStoreId,
                users.INVITER!,
                emails.JOINER!,
                "VIEWER",
            );
            // Since the invite went out, the inviter lost member:invite.
            await prisma.membership.update({
                where: {
                    organizationId_userId: {
                        organizationId: orgId,
                        userId: users.INVITER!,
                    },
                },
                data: { role: "MEMBER" },
            });
            const invite = await prisma.storeInvitation.findFirstOrThrow({
                where: { storeId: otherStoreId, email: emails.JOINER! },
            });
            await expect(
                members.acceptInvitation(invite.token, {
                    id: users.JOINER!,
                    email: emails.JOINER!,
                }),
            ).rejects.toThrow(/can no longer be accepted/);
            expect(await membershipOf("JOINER")).toBeNull();
            expect(
                await prisma.storeMembers.count({
                    where: { userId: users.JOINER! },
                }),
            ).toBe(0);
            expect(
                (
                    await prisma.storeInvitation.findUniqueOrThrow({
                        where: { id: invite.id },
                    })
                ).status,
            ).toBe("PENDING");
        });

        it("removing someone from Team revokes the storefront invites waiting for them", async () => {
            await prisma.membership.create({
                data: {
                    organizationId: orgId,
                    userId: users.LEAVER!,
                    role: "MEMBER",
                },
            });
            await members.createInvitation(
                storeId,
                users.OWNER!,
                emails.LEAVER!.toUpperCase(),
                "EDITOR",
            );
            const invite = await prisma.storeInvitation.findFirstOrThrow({
                where: {
                    storeId,
                    email: emails.LEAVER!.toUpperCase(),
                },
            });

            await team.remove(await as("OWNER"), users.LEAVER!);
            expect(
                (
                    await prisma.storeInvitation.findUniqueOrThrow({
                        where: { id: invite.id },
                    })
                ).status,
            ).toBe("REVOKED");
            await expect(
                members.acceptInvitation(invite.token, {
                    id: users.LEAVER!,
                    email: emails.LEAVER!,
                }),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(await membershipOf("LEAVER")).toBeNull();
        });

        it("accepting twice is the one acceptance", async () => {
            await members.createInvitation(
                storeId,
                users.OWNER!,
                emails.JOINER!,
                "VIEWER",
            );
            const invite = await prisma.storeInvitation.findFirstOrThrow({
                where: { storeId, email: emails.JOINER! },
            });
            const who = { id: users.JOINER!, email: emails.JOINER! };
            const [a, b] = await Promise.all([
                members.acceptInvitation(invite.token, who),
                members.acceptInvitation(invite.token, who),
            ]);
            expect(a).toEqual({ storeId });
            expect(b).toEqual({ storeId });
            expect(await membershipOf("JOINER")).toEqual({
                role: "storefront-team",
            });
        });
    });
});
