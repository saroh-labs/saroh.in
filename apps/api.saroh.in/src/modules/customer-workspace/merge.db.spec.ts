/**
 * Merging two customers against a real Postgres (DEC-042, C9): what moves,
 * the tombstone, the refusals, consent, the site account (ADR-011), and two
 * merges racing. Runs in the integration project (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import {
    isReservedContactEmail,
    reservedAccountEmail,
    reservedRemovedEmail,
} from "../contacts/contact-email";
import { ContactsService } from "../contacts/contacts.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { AccountLinkingService } from "../site-accounts/account-linking.service";
import { CustomerAccountRepository } from "../site-accounts/customer-account.repository";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomerWorkspaceService } from "./customer-workspace.service";
import type { MergeContactsDto } from "./merge.dto";
import { MergeService } from "./merge.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;

const merges = new MergeService();
const details = new CustomerDetailService(availability);
const workspace = new CustomerWorkspaceService(availability);
const linking = new AccountLinkingService(new CustomerAccountRepository());

let ownerId = "";

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({ data: { email: `c9-owner-${tag}@x.com` } })
    ).id;
});

async function business(): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Northwind", slug: `c9-${next()}` },
    });
    return { organizationId: org.id, userId: ownerId, role: "OWNER" };
}

async function person(
    ctx: OrganizationContext,
    over: {
        email?: string;
        firstName?: string | null;
        lastName?: string | null;
        phone?: string | null;
        company?: string | null;
        createdAt?: Date;
    } = {},
): Promise<string> {
    return (
        await prisma.contact.create({
            data: {
                organizationId: ctx.organizationId,
                email: over.email ?? `p-${next()}@example.in`,
                firstName:
                    over.firstName === undefined ? "Asha" : over.firstName,
                lastName: over.lastName ?? null,
                phone: over.phone ?? null,
                company: over.company ?? null,
                ...(over.createdAt ? { createdAt: over.createdAt } : {}),
            },
        })
    ).id;
}

const OLDER = new Date("2026-01-01T00:00:00Z");
const NEWER = new Date("2026-06-01T00:00:00Z");

function dto(survivorId: string, over: Partial<MergeContactsDto> = {}) {
    return { survivorId, ...over } as MergeContactsDto;
}

async function store(ctx: OrganizationContext): Promise<string> {
    return (
        await prisma.store.create({
            data: {
                name: "Northwind",
                slug: `c9-store-${next()}`,
                organizationId: ctx.organizationId,
            },
        })
    ).id;
}

/** A store customer linked to `contactId`, with `orders` paid orders. */
async function linkedCustomer(
    ctx: OrganizationContext,
    storeId: string,
    contactId: string,
    orders: number,
): Promise<string> {
    const customer = await prisma.customer.create({
        data: {
            storeId,
            organizationId: ctx.organizationId,
            email: `shop-${next()}@example.in`,
        },
    });
    await prisma.customerIdentityLink.create({
        data: {
            organizationId: ctx.organizationId,
            contactId,
            customerId: customer.id,
            linkedByUserId: ownerId,
        },
    });
    for (let i = 0; i < orders; i += 1) {
        await prisma.order.create({
            data: {
                storeId,
                organizationId: ctx.organizationId,
                orderId: `ORD-${next()}`,
                customerId: customer.id,
                subtotal: "450",
                total: "450",
                currency: "INR",
                paymentStatus: "PAID",
            },
        });
    }
    return customer.id;
}

async function service(ctx: OrganizationContext): Promise<string> {
    return (
        await prisma.service.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Haircut",
                durationMinutes: 45,
                capacity: 1,
                priceCents: 50_000,
                currency: "INR",
                timezone: "Asia/Kolkata",
            },
        })
    ).id;
}

async function booking(
    ctx: OrganizationContext,
    serviceId: string,
    contactId: string,
): Promise<string> {
    const start = new Date(Date.now() + 86_400_000 * (1 + (seq++ % 30)));
    return (
        await prisma.booking.create({
            data: {
                organizationId: ctx.organizationId,
                serviceId,
                contactId,
                startAt: start,
                endAt: new Date(start.getTime() + 45 * 60_000),
                timezone: "Asia/Kolkata",
                status: "CONFIRMED",
                bookerName: "Asha",
                snapshot: {},
            },
        })
    ).id;
}

async function plan(ctx: OrganizationContext, name = "Monthly") {
    return (
        await prisma.subscriptionPlan.create({
            data: {
                organizationId: ctx.organizationId,
                name,
                price: "1600",
                currency: "INR",
                interval: "MONTH",
            },
        })
    ).id;
}

async function subscribe(
    ctx: OrganizationContext,
    planId: string,
    contactId: string,
) {
    const now = new Date();
    return (
        await prisma.customerSubscription.create({
            data: {
                organizationId: ctx.organizationId,
                planId,
                contactId,
                price: "1600",
                currency: "INR",
                interval: "MONTH",
                timezone: "Asia/Kolkata",
                anchorAt: now,
                currentPeriodStart: now,
                currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
            },
        })
    ).id;
}

async function packFor(ctx: OrganizationContext, contactId: string) {
    const pack = await prisma.classPack.create({
        data: {
            organizationId: ctx.organizationId,
            name: "10-class pack",
            credits: 10,
            validityDays: 90,
            price: "4500.00",
            currency: "INR",
            status: "ACTIVE",
        },
    });
    return (
        await prisma.packPurchase.create({
            data: {
                organizationId: ctx.organizationId,
                packId: pack.id,
                contactId,
                credits: 10,
                price: "4500.00",
                currency: "INR",
                expiresAt: new Date(Date.now() + 90 * 86_400_000),
            },
        })
    ).id;
}

async function site(ctx: OrganizationContext): Promise<string> {
    return (
        await prisma.site.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Northwind",
                slug: `c9-site-${next()}`,
            },
        })
    ).id;
}

async function account(
    ctx: OrganizationContext,
    contactId: string,
    email: string,
): Promise<string> {
    return (
        await prisma.customerAccount.create({
            data: {
                organizationId: ctx.organizationId,
                contactId,
                email,
                emailVerifiedAt: new Date(),
            },
        })
    ).id;
}

async function session(
    ctx: OrganizationContext,
    accountId: string,
    siteId: string,
) {
    return prisma.customerSession.create({
        data: {
            organizationId: ctx.organizationId,
            accountId,
            siteId,
            tokenHash: randomBytes(32).toString("hex"),
            expiresAt: new Date(Date.now() + 86_400_000),
        },
    });
}

async function consent(
    contactId: string,
    ctx: OrganizationContext,
    channel: "EMAIL" | "WHATSAPP",
    status: "GRANTED" | "REVOKED",
    at: Date,
) {
    const row = await prisma.consent.create({
        data: {
            organizationId: ctx.organizationId,
            contactId,
            channel,
            status,
        },
    });
    // `updatedAt` is when they said it.
    await prisma.$executeRaw`UPDATE "Consent" SET "updatedAt" = ${at} WHERE id = ${row.id}`;
}

describe("merging two customers (DEC-042)", () => {
    it("moves everything to the survivor, leaves a tombstone, and the counts match the preview", async () => {
        const ctx = await business();
        const a = await person(ctx, {
            email: "asha@example.in",
            phone: "+91 98450 00001",
            createdAt: OLDER,
        });
        const b = await person(ctx, {
            email: "asha.r@gmail.com",
            firstName: "Asha R",
            phone: "98450 00002",
            company: "Rao Studio",
            createdAt: NEWER,
        });
        const storeId = await store(ctx);
        await linkedCustomer(ctx, storeId, a, 2);
        await booking(ctx, await service(ctx), a);
        await prisma.contactNote.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: a,
                body: "Likes oat milk",
            },
        });
        const subId = await subscribe(ctx, await plan(ctx), b);
        const packId = await packFor(ctx, b);
        await prisma.contactNote.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: b,
                body: "Prefers mornings",
            },
        });

        const preview = await merges.preview(ctx, b, a);
        // The older one is offered as the survivor (default 22).
        expect(preview.survivorId).toBe(a);
        expect(preview.otherId).toBe(b);
        expect(preview.refusals).toEqual([]);
        expect(preview.choices.email).toEqual({
            survivor: "asha@example.in",
            other: "asha.r@gmail.com",
        });
        expect(preview.account.carried.action).toBe("none");

        const result = await merges.merge(ctx, b, a, dto(a));
        expect(result.survivorId).toBe(a);
        expect(result.mergedId).toBe(b);
        expect(result.moves).toEqual(preview.moves);
        expect(
            Object.fromEntries(result.moves.map((m) => [m.key, m.count])),
        ).toEqual({ subscriptions: 1, packs: 1, notes: 1 });

        const [sub, pack, notes, orders, bookings] = await Promise.all([
            prisma.customerSubscription.findUniqueOrThrow({
                where: { id: subId },
            }),
            prisma.packPurchase.findUniqueOrThrow({ where: { id: packId } }),
            prisma.contactNote.count({ where: { contactId: a } }),
            prisma.order.count({
                where: {
                    customer: { identityLinks: { some: { contactId: a } } },
                },
            }),
            prisma.booking.count({ where: { contactId: a } }),
        ]);
        expect(sub.contactId).toBe(a);
        expect(pack.contactId).toBe(a);
        expect(notes).toBe(2);
        expect(orders).toBe(2);
        expect(bookings).toBe(1);

        const tomb = await prisma.contact.findUniqueOrThrow({
            where: { id: b },
        });
        expect(tomb).toMatchObject({
            mergedIntoId: a,
            firstName: null,
            lastName: null,
            phone: null,
            company: null,
        });
        expect(tomb.mergedAt).toBeInstanceOf(Date);
        expect(isReservedContactEmail(tomb.email)).toBe(true);

        const survivor = await prisma.contact.findUniqueOrThrow({
            where: { id: a },
        });
        // Kept its own name, email and phone; company filled from the other.
        expect(survivor).toMatchObject({
            email: "asha@example.in",
            phone: "+91 98450 00001",
            company: "Rao Studio",
        });

        // The old contact's page goes to the survivor; its detail has nothing.
        await expect(details.read(ctx, b)).resolves.toEqual({ mergedInto: a });
        await expect(details.detail(ctx, b)).rejects.toBeInstanceOf(
            NotFoundException,
        );

        // On the survivor's timeline, and in Activity with ids and counts only.
        const { events } = await workspace.timeline(ctx, a);
        expect(events.map((e) => e.title)).toContain("Merged with a duplicate");
        const audit = await prisma.auditEvent.findFirstOrThrow({
            where: {
                organizationId: ctx.organizationId,
                action: "customer.merged",
            },
        });
        expect(audit.targetId).toBe(a);
        const written = JSON.stringify(audit.metadata);
        expect(written).toContain(b);
        expect(written).not.toContain("asha.r@gmail.com");
        expect(written).not.toContain("98450");
    });

    it("lets the survivor take the other's email, freed by the tombstone first", async () => {
        const ctx = await business();
        const a = await person(ctx, {
            email: "old@example.in",
            createdAt: OLDER,
        });
        const b = await person(ctx, {
            email: "new@example.in",
            createdAt: NEWER,
        });
        await merges.merge(ctx, a, b, dto(a, { email: "other" }));
        const survivor = await prisma.contact.findUniqueOrThrow({
            where: { id: a },
        });
        expect(survivor.email).toBe("new@example.in");
    });

    it("keeps notes side by side and a Needs attention entry once", async () => {
        const ctx = await business();
        const a = await person(ctx, { createdAt: OLDER });
        const b = await person(ctx, { createdAt: NEWER });
        for (const contactId of [a, b]) {
            await prisma.contactAttention.create({
                data: {
                    organizationId: ctx.organizationId,
                    contactId,
                    kind: "ALLERGY",
                    label: "Peanuts",
                },
            });
        }
        await prisma.contactAttention.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: b,
                kind: "ACCESS",
                label: "Wheelchair",
            },
        });
        await merges.merge(ctx, a, b, dto(a));
        const live = await prisma.contactAttention.findMany({
            where: { contactId: a, removedAt: null },
            select: { label: true },
            orderBy: { label: "asc" },
        });
        expect(live.map((e) => e.label)).toEqual(["Peanuts", "Wheelchair"]);
        // The duplicate is kept for the record, retired.
        expect(
            await prisma.contactAttention.count({ where: { contactId: a } }),
        ).toBe(3);
    });

    it("moves each store record's link once", async () => {
        const ctx = await business();
        const a = await person(ctx, { createdAt: OLDER });
        const b = await person(ctx, { createdAt: NEWER });
        const storeId = await store(ctx);
        const shared = await linkedCustomer(ctx, storeId, a, 1);
        await prisma.customerIdentityLink.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: b,
                customerId: shared,
                linkedByUserId: ownerId,
            },
        });
        await linkedCustomer(ctx, storeId, b, 1);
        const preview = await merges.preview(ctx, a, b);
        expect(
            Object.fromEntries(preview.moves.map((m) => [m.key, m.count])),
        ).toEqual({ orders: 1, links: 1 });
        await merges.merge(ctx, a, b, dto(a));
        expect(
            await prisma.customerIdentityLink.count({
                where: { contactId: a },
            }),
        ).toBe(2);
        expect(
            await prisma.customerIdentityLink.count({
                where: { contactId: b },
            }),
        ).toBe(0);
    });

    it("re-points an earlier tombstone, so a chain is one hop", async () => {
        const ctx = await business();
        const a = await person(ctx, { createdAt: OLDER });
        const b = await person(ctx, { createdAt: NEWER });
        const c = await person(ctx, {
            createdAt: new Date("2026-08-01T00:00:00Z"),
        });
        await merges.merge(ctx, b, c, dto(b));
        await merges.merge(ctx, a, b, dto(a));
        const tomb = await prisma.contact.findUniqueOrThrow({
            where: { id: c },
        });
        expect(tomb.mergedIntoId).toBe(a);
    });
});

describe("what refuses a merge", () => {
    it("both on the live plan Monthly → 409 naming it (default 23)", async () => {
        const ctx = await business();
        const a = await person(ctx);
        const b = await person(ctx);
        const monthly = await plan(ctx, "Monthly");
        await subscribe(ctx, monthly, a);
        await subscribe(ctx, monthly, b);
        const preview = await merges.preview(ctx, a, b);
        expect(preview.refusals).toEqual([
            {
                reason: "same-plan",
                message: "Cancel one of their Monthly subscriptions first",
            },
        ]);
        await expect(merges.merge(ctx, a, b, dto(a))).rejects.toMatchObject({
            response: {
                message: "Cancel one of their Monthly subscriptions first",
            },
        });
        await expect(merges.merge(ctx, a, b, dto(a))).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it("both enrolled in the same active course → 409", async () => {
        const ctx = await business();
        const a = await person(ctx);
        const b = await person(ctx);
        const course = await prisma.course.create({
            data: {
                organizationId: ctx.organizationId,
                serviceId: await service(ctx),
                name: "Pottery",
                price: "6000",
                currency: "INR",
                seats: 8,
                status: "OPEN",
            },
        });
        for (const contactId of [a, b]) {
            await prisma.courseEnrollment.create({
                data: {
                    organizationId: ctx.organizationId,
                    courseId: course.id,
                    contactId,
                    price: "6000",
                    currency: "INR",
                },
            });
        }
        await expect(merges.merge(ctx, a, b, dto(a))).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it("another business's contact → 404; a contact with itself → 400", async () => {
        const ctx = await business();
        const elsewhere = await business();
        const a = await person(ctx);
        const theirs = await person(elsewhere);
        await expect(
            merges.merge(ctx, a, theirs, dto(a)),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(merges.merge(ctx, a, a, dto(a))).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it("an already merged contact → 404 already merged; a removed one → 409", async () => {
        const ctx = await business();
        const a = await person(ctx);
        const b = await person(ctx);
        const c = await person(ctx);
        await merges.merge(ctx, a, b, dto(a));
        await expect(merges.merge(ctx, c, b, dto(c))).rejects.toMatchObject({
            response: { details: { reason: "already-merged" } },
        });
        await prisma.contact.update({
            where: { id: c },
            data: { email: reservedRemovedEmail(c), firstName: null },
        });
        await expect(merges.merge(ctx, a, c, dto(a))).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it("a role that edits customers but can't merge them → 403", async () => {
        const ctx = await business();
        const a = await person(ctx);
        const b = await person(ctx);
        const editor: OrganizationContext = {
            ...ctx,
            role: "MEMBER",
            roleKey: "front-desk",
            actions: resolveCapabilities("front-desk", [
                "contact:read",
                "contact:write",
            ]),
        };
        await expect(merges.preview(editor, a, b)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(merges.merge(editor, a, b, dto(a))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });

    it("two merges of the same pair at once: one wins, the other 404s on the tombstone", async () => {
        const ctx = await business();
        const a = await person(ctx, { createdAt: OLDER });
        const b = await person(ctx, { createdAt: NEWER });
        const results = await Promise.allSettled([
            merges.merge(ctx, a, b, dto(a)),
            merges.merge(ctx, a, b, dto(a)),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const lost = results.find((r) => r.status === "rejected");
        expect((lost as PromiseRejectedResult).reason).toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe("consent on a merge (default 24)", () => {
    const lastYear = new Date("2025-09-01T00:00:00Z");
    const lastWeek = new Date(Date.now() - 7 * 86_400_000);

    async function pair() {
        const ctx = await business();
        const a = await person(ctx, {
            email: "a@example.in",
            createdAt: OLDER,
        });
        const b = await person(ctx, {
            email: "b@example.in",
            createdAt: NEWER,
        });
        await consent(a, ctx, "EMAIL", "REVOKED", lastYear);
        await consent(b, ctx, "EMAIL", "GRANTED", lastWeek);
        return { ctx, a, b };
    }

    const emailConsent = async (contactId: string) =>
        (
            await prisma.consent.findMany({
                where: { contactId, channel: "EMAIL" },
                select: { status: true },
            })
        ).map((c) => c.status);

    it("B's newer yes survives when the survivor keeps B's email", async () => {
        const { ctx, a, b } = await pair();
        const preview = await merges.preview(ctx, a, b);
        expect(preview.consent.find((c) => c.channel === "EMAIL")).toEqual({
            channel: "EMAIL",
            ifKept: {
                survivor: { status: "REVOKED", from: "survivor" },
                other: { status: "GRANTED", from: "other" },
            },
        });
        await merges.merge(ctx, a, b, dto(a, { email: "other" }));
        expect(await emailConsent(a)).toEqual(["GRANTED"]);
        expect(await emailConsent(b)).toEqual([]);
    });

    it("A's opt-out stays when the survivor keeps A's email", async () => {
        const { ctx, a, b } = await pair();
        await merges.merge(ctx, a, b, dto(a, { email: "survivor" }));
        expect(await emailConsent(a)).toEqual(["REVOKED"]);
    });

    it("A granted and B revoked later → revoked", async () => {
        const ctx = await business();
        const a = await person(ctx, { createdAt: OLDER });
        const b = await person(ctx, { createdAt: NEWER });
        await consent(a, ctx, "EMAIL", "GRANTED", lastYear);
        await consent(b, ctx, "EMAIL", "REVOKED", lastWeek);
        await merges.merge(ctx, a, b, dto(a));
        expect(await emailConsent(a)).toEqual(["REVOKED"]);
    });
});

describe("the site account on a merge (ADR-011)", () => {
    it("only B signs in → B's account moves to A once the merchant confirms", async () => {
        const ctx = await business();
        const a = await person(ctx, {
            email: "asha@example.in",
            createdAt: OLDER,
        });
        const b = await person(ctx, {
            email: "asha.r@gmail.com",
            createdAt: NEWER,
        });
        const accountId = await account(ctx, b, "asha.r@gmail.com");

        const preview = await merges.preview(ctx, a, b);
        expect(preview.account.carried).toEqual({
            action: "move",
            seesCombined:
                "a…@gmail.com signs in on your website and will see everything here",
            stopsReaching: null,
            confirmationRequired: true,
        });

        await expect(merges.merge(ctx, a, b, dto(a))).rejects.toMatchObject({
            response: { details: { reason: "confirm-account" } },
        });
        await merges.merge(ctx, a, b, dto(a, { accountConfirmed: true }));
        const moved = await prisma.customerAccount.findUniqueOrThrow({
            where: { id: accountId },
        });
        expect(moved).toMatchObject({ contactId: a, status: "ACTIVE" });
    });

    it("\"Don't carry the sign-in over\" → B's account is retired and kept on the tombstone", async () => {
        const ctx = await business();
        const a = await person(ctx, { createdAt: OLDER });
        const b = await person(ctx, { createdAt: NEWER });
        const accountId = await account(ctx, b, `b-${next()}@gmail.com`);
        await merges.merge(ctx, a, b, dto(a, { carryAccount: false }));
        const retired = await prisma.customerAccount.findUniqueOrThrow({
            where: { id: accountId },
        });
        expect(retired).toMatchObject({ contactId: b, status: "MERGED" });
    });

    it("both sign in → B's is retired into A's, its sessions end, and its email opens no new account", async () => {
        const ctx = await business();
        const siteId = await site(ctx);
        const a = await person(ctx, {
            email: "farah@example.in",
            createdAt: OLDER,
        });
        const b = await person(ctx, {
            email: "farah.k@gmail.com",
            createdAt: NEWER,
        });
        const aAccount = await account(ctx, a, "farah@example.in");
        const bAccount = await account(ctx, b, "farah.k@gmail.com");
        const live = await session(ctx, bAccount, siteId);
        await booking(ctx, await service(ctx), b);

        const preview = await merges.preview(ctx, a, b);
        expect(preview.account.carried.stopsReaching).toBe(
            "f…@gmail.com will be asked to sign in with f…@example.in instead",
        );
        await merges.merge(ctx, a, b, dto(a, { accountConfirmed: true }));

        const retired = await prisma.customerAccount.findUniqueOrThrow({
            where: { id: bAccount },
        });
        expect(retired).toMatchObject({
            status: "MERGED",
            mergedIntoId: aAccount,
            contactId: b,
        });
        const ended = await prisma.customerSession.findUniqueOrThrow({
            where: { id: live.id },
        });
        expect(ended.revokedAt).toBeInstanceOf(Date);

        // "This email now signs in as f…@example.in", and no session.
        const again = await prisma.$transaction((tx) =>
            linking.linkOrCreate(
                tx,
                ctx.organizationId,
                "farah.k@gmail.com",
                new Date(),
            ),
        );
        expect(again).toEqual({ kind: "merged", maskedEmail: "f…@example.in" });
        expect(
            await prisma.contact.count({
                where: {
                    organizationId: ctx.organizationId,
                    mergedIntoId: null,
                },
            }),
        ).toBe(1);
    });

    it("A4's separate contact merged with the real one: only the real email is offered, and it's stamped STAFF_CONFIRMED", async () => {
        const ctx = await business();
        const real = await person(ctx, {
            email: "meera@example.in",
            createdAt: OLDER,
        });
        const separate = await person(ctx, { createdAt: NEWER });
        await prisma.contact.update({
            where: { id: separate },
            data: { email: reservedAccountEmail(separate), firstName: null },
        });
        await account(ctx, separate, "meera@example.in");

        const preview = await merges.preview(ctx, real, separate);
        expect(preview.choices.email).toEqual({
            survivor: "meera@example.in",
            other: "meera@example.in",
        });
        await merges.merge(
            ctx,
            real,
            separate,
            dto(real, { email: "other", accountConfirmed: true }),
        );
        const survivor = await prisma.contact.findUniqueOrThrow({
            where: { id: real },
        });
        expect(survivor).toMatchObject({
            email: "meera@example.in",
            emailVerifiedVia: "STAFF_CONFIRMED",
        });
        expect(survivor.emailVerifiedAt).toBeInstanceOf(Date);
    });
});

describe("late writers after a merge", () => {
    it("a sign-in whose email the tombstone's survivor verified links to the survivor", async () => {
        const ctx = await business();
        const a = await person(ctx, {
            email: "kiran@example.in",
            createdAt: OLDER,
        });
        const b = await person(ctx, {
            email: "kiran.k@gmail.com",
            createdAt: NEWER,
        });
        await merges.merge(ctx, a, b, dto(a));
        await prisma.contact.update({
            where: { id: a },
            data: {
                emailVerifiedAt: new Date(),
                emailVerifiedVia: "BOOKING_CONFIRMATION",
            },
        });
        const identity = await prisma.$transaction((tx) =>
            linking.linkOrCreate(
                tx,
                ctx.organizationId,
                "kiran@example.in",
                new Date(),
            ),
        );
        expect(identity.kind).toBe("signed-in");
        if (identity.kind === "signed-in") {
            expect(identity.account.contactId).toBe(a);
        }
    });

    it("leaves the tombstone out of the customers and contacts lists", async () => {
        const ctx = await business();
        const a = await person(ctx, { createdAt: OLDER });
        const b = await person(ctx, { createdAt: NEWER });
        await merges.merge(ctx, a, b, dto(a));
        const listed = await new ContactsService().list(ctx);
        expect(listed.map((c) => c.id)).toEqual([a]);
    });
});
