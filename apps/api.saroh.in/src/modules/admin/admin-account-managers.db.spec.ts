/**
 * Who looks after which business, by staff (DEC-169, admin console U25),
 * against a real Postgres and the real admin guard stack:
 *
 * - Assign starts an ASSIGNED link; a reassign ends the old one (a
 *   business brought in becomes assigned) and starts ASSIGNED, in one
 *   transaction; End leaves the business with no manager.
 * - Only someone holding the Account manager role now, who doesn't own the
 *   business, can be given it; a deleted business takes nobody.
 * - Share out evenly goes paying-first, fewest-first, among people on
 *   commission, and stops at capacity.
 * - Revoking a teammate, or an amend that takes the role away, ends their
 *   links at once and the businesses show as unassigned; changing only the
 *   role's expiry keeps them.
 * - An Account manager can't assign (403 at the route and in the service).
 * - Every write is on the ledger; a double submit with one idempotency key
 *   is applied once.
 *
 * The integration schema is built by `prisma db push`, which carries no
 * CHECK and no trigger: `beforeAll` adds the U19 migration's own, so every
 * write here passes the append-only rule. Under `TEST_RLS=on` the
 * migrations are replayed and they are already there.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../common/guards/better-auth.guard", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UnauthorizedException } = require("@nestjs/common") as {
        UnauthorizedException: new (message: string) => Error;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prisma } = require("@saroh/database") as {
        prisma: {
            user: {
                findUnique: (args: unknown) => Promise<{ id: string } | null>;
            };
        };
    };
    return {
        BetterAuthGuard: class BetterAuthGuard {
            async canActivate(context: {
                switchToHttp: () => {
                    getRequest: () => {
                        headers: Record<string, string | undefined>;
                        user?: unknown;
                    };
                };
            }) {
                const request = context.switchToHttp().getRequest();
                const id = request.headers["x-test-user"];
                const user = id
                    ? await prisma.user.findUnique({ where: { id } })
                    : null;
                if (!user) {
                    throw new UnauthorizedException(
                        "Invalid or expired session",
                    );
                }
                request.user = user;
                return true;
            }
        },
    };
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { validationPipeOptions } from "../../common/validation";
import { AdminAccessService } from "./admin-access.service";
import { AdminAccountManagersController } from "./admin-account-managers.controller";
import {
    AdminAccountManagersService,
    managerOf,
} from "./admin-account-managers.service";
import { AdminAuditService } from "./admin-audit.service";
import type { AdminRole } from "./admin-permissions";
import { AdminRole as Roles, permissionsFor } from "./admin-permissions";
import { AdminStaffService } from "./admin-staff.service";
import { LINK_END_WORDS } from "./manager-links";
import { OrganizationAccessSessionGuard } from "./organization-access-session.guard";
import { generateManagerCode } from "./staff-profile";

const DAY_MS = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => (seq += 1);

const audit = new AdminAuditService();
const service = new AdminAccountManagersService(audit);
const staffService = new AdminStaffService(audit);
const controller = new AdminAccountManagersController(
    service,
    new IdempotencyService(),
);

let app: INestApplication;
let url: string;

interface Staff {
    userId: string;
    platformAdminId: string;
    roles: AdminRole[];
}

/** A teammate with these roles, a profile, and a made-up name. */
async function teammate(
    name: string,
    roles: AdminRole[],
    profile: {
        onCommission?: boolean;
        capacity?: number | null;
        expiresAt?: Date | null;
    } = {},
): Promise<Staff> {
    const user = await prisma.user.create({
        data: { email: `staff-${next()}-${tag}@example.com`, name },
    });
    const admin = await prisma.platformAdmin.create({
        data: {
            userId: user.id,
            roleAssignments: {
                create: roles.map((role) => ({
                    role,
                    reason: "test grant",
                    expiresAt: profile.expiresAt ?? null,
                })),
            },
        },
    });
    await prisma.staffProfile.create({
        data: {
            platformAdminId: admin.id,
            worksAs: "ACCOUNT_MANAGER_JOB",
            managerCode: generateManagerCode(),
            onCommission: profile.onCommission ?? false,
            capacity: profile.capacity ?? null,
        },
    });
    return { userId: user.id, platformAdminId: admin.id, roles };
}

const as = (staff: Staff): PlatformAdminInfo => ({
    userId: staff.userId,
    platformAdminId: staff.platformAdminId,
    roles: staff.roles,
    permissions: permissionsFor(staff.roles),
    viaBootstrap: false,
});

/** A business; `paying` puts it on a priced plan billed by a provider. */
async function business(
    input: {
        name?: string;
        status?: string;
        paying?: boolean;
        ownerUserId?: string;
        createdAt?: Date;
    } = {},
): Promise<string> {
    const n = next();
    const org = await prisma.organization.create({
        data: {
            name: input.name ?? `Rye & Co ${n}`,
            slug: `adm-am-${n}-${tag}`,
            lifecycleStatus: input.status ?? "ACTIVE",
            ...(input.createdAt ? { createdAt: input.createdAt } : {}),
            ...(input.ownerUserId
                ? {
                      memberships: {
                          create: { userId: input.ownerUserId, role: "OWNER" },
                      },
                  }
                : {}),
        },
    });
    if (input.paying) {
        const plan = await prisma.plan.create({
            data: {
                key: `am-plan-${n}-${tag}`,
                name: "Grow",
                version: 1,
                interval: "month",
                priceCents: 1,
                entitlements: {},
            },
        });
        await prisma.subscription.create({
            data: {
                organizationId: org.id,
                planId: plan.id,
                status: "ACTIVE",
                provider: "RAZORPAY",
            },
        });
    }
    return org.id;
}

/** A link U19 would write at sign-up: brought in through `?am=`. */
async function broughtIn(organizationId: string, manager: Staff) {
    return prisma.accountManagerLink.create({
        data: {
            organizationId,
            platformAdminId: manager.platformAdminId,
            source: "LINK",
            kind: "BROUGHT_IN",
            evidence: { source: "LINK", code: "ABCD2345", cookieSetAt: null },
            startedAt: new Date(Date.now() - 10 * DAY_MS),
        },
    });
}

const linksOf = (organizationId: string) =>
    prisma.accountManagerLink.findMany({
        where: { organizationId },
        orderBy: { startedAt: "asc" },
    });

const ledger = (organizationId: string) =>
    prisma.adminAuditEvent.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
        select: {
            action: true,
            actorUserId: true,
            permission: true,
            reason: true,
            metadata: true,
        },
    });

const key = () => `idem-${next()}-${tag}`;

function call(
    method: "POST" | "DELETE" | "GET",
    path: string,
    asUser: string,
    body?: unknown,
) {
    return fetch(`${url}/admin${path}`, {
        method,
        headers: {
            "x-test-user": asUser,
            "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

const MIGRATION = join(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20261129200000_account_manager_links/migration.sql",
);

/** The U19 migration's CHECKs and trigger, added where `db push` left them out. */
async function ensureMigrationRules(): Promise<void> {
    const sql = readFileSync(MIGRATION, "utf8");
    const trigger = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM pg_trigger
        WHERE tgname = 'AccountManagerLink_append_only'`;
    if (Number(trigger[0]?.n ?? 0) === 0) {
        const start = sql.indexOf("-- append-only:begin");
        const end = sql.indexOf("-- append-only:end");
        await prisma.$executeRawUnsafe(sql.slice(start, end));
    }
    const checks = sql
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) =>
            /ADD CONSTRAINT "AccountManagerLink_\w+_check"/.test(statement),
        );
    for (const statement of checks) {
        const name = /ADD CONSTRAINT "(\w+)"/.exec(statement)?.[1] ?? "";
        const found = await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*)::bigint AS n FROM pg_constraint WHERE conname = ${name}`;
        if (Number(found[0]?.n ?? 0) === 0) {
            await prisma.$executeRawUnsafe(statement);
        }
    }
}

let owner: Staff;
let support: Staff;
let billing: Staff;
let asha: Staff;
let vikram: Staff;

beforeAll(async () => {
    await ensureMigrationRules();
    const moduleRef = await Test.createTestingModule({
        controllers: [AdminAccountManagersController],
        providers: [
            AdminAccountManagersService,
            AdminAuditService,
            IdempotencyService,
            AdminAccessService,
            PlatformAdminGuard,
            PlatformPermissionGuard,
            OrganizationAccessSessionGuard,
        ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();

    // A lasting Platform owner, so staff changes may go through.
    owner = await teammate("Meera Owner", [Roles.PlatformOwner]);
    support = await teammate("Sana Support", [Roles.Support]);
    billing = await teammate("Kabir Billing", [Roles.Billing]);
    asha = await teammate("Asha", [Roles.AccountManager]);
    vikram = await teammate("Vikram", [Roles.AccountManager]);
});

afterAll(async () => {
    // The integration setup truncates every table after the file.
    await app?.close();
});

describe("assign, reassign and end (U25)", () => {
    it("assign starts an ASSIGNED link, with who gave it, on the ledger", async () => {
        const org = await business();
        const result = await service.assign(as(support), org, {
            platformAdminId: asha.platformAdminId,
            reason: "Asha covers this city",
        });
        expect(result.previous).toBeNull();
        expect(result.manager).toMatchObject({
            platformAdminId: asha.platformAdminId,
            name: "Asha",
            kind: "ASSIGNED",
            source: "ASSIGNED",
        });
        const [link] = await linksOf(org);
        expect(link).toMatchObject({
            kind: "ASSIGNED",
            source: "ASSIGNED",
            startedByUserId: support.userId,
            endedAt: null,
        });
        expect(await ledger(org)).toEqual([
            expect.objectContaining({
                action: "account-manager.assigned",
                actorUserId: support.userId,
                permission: "accounts:assign",
                reason: "Asha covers this city",
                metadata: expect.objectContaining({
                    linkId: link?.id,
                    platformAdminId: asha.platformAdminId,
                    previousPlatformAdminId: null,
                }),
            }),
        ]);
    });

    it("reassign ends the old link and starts ASSIGNED, so brought in becomes assigned", async () => {
        const org = await business();
        const first = await broughtIn(org, asha);
        const result = await service.assign(as(owner), org, {
            platformAdminId: vikram.platformAdminId,
            reason: "Asha is on leave",
        });
        expect(result.previous).toMatchObject({
            platformAdminId: asha.platformAdminId,
            kind: "BROUGHT_IN",
        });
        expect(result.manager).toMatchObject({
            platformAdminId: vikram.platformAdminId,
            kind: "ASSIGNED",
        });
        const links = await linksOf(org);
        expect(links).toHaveLength(2);
        expect(links[0]).toMatchObject({
            id: first.id,
            kind: "BROUGHT_IN",
            endedByUserId: owner.userId,
            endedReason: "Asha is on leave",
        });
        expect(links[0]?.endedAt).not.toBeNull();
        expect(links[1]).toMatchObject({
            platformAdminId: vikram.platformAdminId,
            kind: "ASSIGNED",
            endedAt: null,
        });
        // The evidence of how Asha brought it in is kept on her link.
        expect(links[0]?.evidence).toMatchObject({ source: "LINK" });
        const [row] = await ledger(org);
        expect(row).toMatchObject({
            action: "account-manager.reassigned",
            metadata: expect.objectContaining({
                previousLinkId: first.id,
                previousPlatformAdminId: asha.platformAdminId,
                previousKind: "BROUGHT_IN",
            }),
        });
    });

    it("refuses giving it to the one who already has it", async () => {
        const org = await business();
        await broughtIn(org, asha);
        await expect(
            service.assign(as(support), org, {
                platformAdminId: asha.platformAdminId,
                reason: "Just to be sure",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await linksOf(org)).toHaveLength(1);
    });

    it("gives a business only to someone who is an Account manager now", async () => {
        const org = await business();
        const expired = await teammate("Rohan", [Roles.AccountManager], {
            expiresAt: new Date(Date.now() + 1000),
        });
        await prisma.platformAdminRoleAssignment.updateMany({
            where: { platformAdminId: expired.platformAdminId },
            data: { expiresAt: new Date(Date.now() - DAY_MS) },
        });
        for (const who of [support, expired]) {
            await expect(
                service.assign(as(owner), org, {
                    platformAdminId: who.platformAdminId,
                    reason: "Try them",
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        await expect(
            service.assign(as(owner), org, {
                platformAdminId: `nobody-${tag}`,
                reason: "Try them",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(await linksOf(org)).toHaveLength(0);
    });

    it("never gives someone a business they own", async () => {
        const org = await business({ ownerUserId: asha.userId });
        await expect(
            service.assign(as(owner), org, {
                platformAdminId: asha.platformAdminId,
                reason: "Her own shop",
            }),
        ).rejects.toThrow("They own this business");
    });

    it("a deleted business takes nobody, and an unknown one is 404", async () => {
        const deleted = await business({ status: "DELETED_RETAINED" });
        await expect(
            service.assign(as(owner), deleted, {
                platformAdminId: asha.platformAdminId,
                reason: "Look after it",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            service.assign(as(owner), `nope-${tag}`, {
                platformAdminId: asha.platformAdminId,
                reason: "Look after it",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("end leaves the business with no manager, with the reason kept", async () => {
        const org = await business();
        const link = await broughtIn(org, asha);
        const result = await service.end(as(support), org, {
            reason: "The owner asked for nobody",
        });
        expect(result.ended).toMatchObject({
            platformAdminId: asha.platformAdminId,
            kind: "BROUGHT_IN",
        });
        expect(await managerOf(prisma, org)).toBeNull();
        const [ended] = await linksOf(org);
        expect(ended).toMatchObject({
            id: link.id,
            endedByUserId: support.userId,
            endedReason: "The owner asked for nobody",
        });
        expect(await ledger(org)).toEqual([
            expect.objectContaining({
                action: "account-manager.ended",
                reason: "The owner asked for nobody",
                metadata: expect.objectContaining({
                    linkId: link.id,
                    cause: "STAFF",
                }),
            }),
        ]);
    });

    it("end with no manager to end is refused, and changes nothing", async () => {
        const org = await business();
        await expect(
            service.end(as(support), org, { reason: "Tidy up" }),
        ).rejects.toThrow("no account manager to end");
        expect(await ledger(org)).toEqual([]);
    });

    it("asks for a reason", async () => {
        const org = await business();
        await expect(
            service.assign(as(support), org, {
                platformAdminId: asha.platformAdminId,
                reason: "  ",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe("who may assign (U25)", () => {
    it("an Account manager can't assign, end or share out: 403 in the service", async () => {
        const org = await business();
        await expect(
            service.assign(as(asha), org, {
                platformAdminId: asha.platformAdminId,
                reason: "Mine now",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.end(as(asha), org, { reason: "Not mine" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.shareOut(as(asha), { reason: "Share it out" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.candidates(as(billing), org),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(await linksOf(org)).toHaveLength(0);
    });

    it("and at the route: 403 for an Account manager or Billing, 201 for Support", async () => {
        const org = await business();
        const body = {
            platformAdminId: asha.platformAdminId,
            reason: "Asha covers this city",
            idempotencyKey: key(),
        };
        for (const who of [asha, billing]) {
            const res = await call(
                "POST",
                `/organizations/${org}/manager`,
                who.userId,
                body,
            );
            expect(res.status).toBe(403);
        }
        expect(
            (
                await call("POST", "/team/share-out", asha.userId, {
                    reason: "Share it out",
                    idempotencyKey: key(),
                })
            ).status,
        ).toBe(403);
        expect(await linksOf(org)).toHaveLength(0);
        const ok = await call(
            "POST",
            `/organizations/${org}/manager`,
            support.userId,
            body,
        );
        expect(ok.status).toBe(201);
    });

    it("lists who a business can go to, fewest first, with their capacity", async () => {
        const org = await business();
        const res = await call(
            "GET",
            `/organizations/${org}/manager/candidates`,
            support.userId,
        );
        expect(res.status).toBe(200);
        const list = (await res.json()) as {
            platformAdminId: string;
            businesses: number;
        }[];
        const ids = list.map((c) => c.platformAdminId);
        expect(ids).toEqual(
            expect.arrayContaining([
                asha.platformAdminId,
                vikram.platformAdminId,
            ]),
        );
        expect(ids).not.toContain(support.platformAdminId);
        const counts = list.map((c) => c.businesses);
        expect(counts).toEqual([...counts].sort((a, b) => a - b));
    });
});

describe("a double submit (U25)", () => {
    it("the same key is applied once and answers the same", async () => {
        const org = await business();
        const dto = {
            platformAdminId: vikram.platformAdminId,
            reason: "Vikram takes it",
            idempotencyKey: key(),
        };
        const first = await controller.assignManager(as(support), org, dto);
        const again = await controller.assignManager(as(support), org, dto);
        expect(JSON.parse(JSON.stringify(again))).toEqual(
            JSON.parse(JSON.stringify(first)),
        );
        expect(await linksOf(org)).toHaveLength(1);
        expect(await ledger(org)).toHaveLength(1);
    });

    it("the same key with a different request is refused", async () => {
        const org = await business();
        const idempotencyKey = key();
        await controller.assignManager(as(support), org, {
            platformAdminId: vikram.platformAdminId,
            reason: "Vikram takes it",
            idempotencyKey,
        });
        await expect(
            controller.assignManager(as(support), org, {
                platformAdminId: asha.platformAdminId,
                reason: "Asha takes it",
                idempotencyKey,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await linksOf(org)).toHaveLength(1);
    });
});

describe("Share out evenly (U25)", () => {
    /** Only these people are on commission for the test. */
    async function onlyOnCommission(...people: Staff[]) {
        await prisma.staffProfile.updateMany({ data: { onCommission: false } });
        await prisma.staffProfile.updateMany({
            where: {
                platformAdminId: { in: people.map((p) => p.platformAdminId) },
            },
            data: { onCommission: true },
        });
    }

    it("goes paying-first, fewest-first, among people on commission", async () => {
        const priya = await teammate("Priya", [Roles.AccountManager]);
        const dev = await teammate("Dev", [Roles.AccountManager]);
        // On the role but not on commission: takes nothing.
        const neel = await teammate("Neel", [Roles.AccountManager]);
        await onlyOnCommission(priya, dev);
        // Priya already looks after one.
        await broughtIn(await business(), priya);

        const t = Date.now();
        const freeOld = await business({ createdAt: new Date(t - 9 * DAY_MS) });
        const freeNew = await business({ createdAt: new Date(t - 2 * DAY_MS) });
        const paying = await business({
            paying: true,
            createdAt: new Date(t - DAY_MS),
        });
        const result = await service.shareOut(as(support), {
            reason: "Monday share-out",
            organizationIds: [freeOld, freeNew, paying],
        });

        // Paying first, to Dev (none); then Priya and Dev are level, and the
        // tie goes by name: Dev; then Priya has fewest.
        expect(result).toEqual({
            assigned: [
                {
                    organizationId: paying,
                    platformAdminId: dev.platformAdminId,
                },
                {
                    organizationId: freeOld,
                    platformAdminId: dev.platformAdminId,
                },
                {
                    organizationId: freeNew,
                    platformAdminId: priya.platformAdminId,
                },
            ],
            left: 0,
        });
        for (const org of [paying, freeOld, freeNew]) {
            const [link] = await linksOf(org);
            expect(link).toMatchObject({
                kind: "ASSIGNED",
                source: "ASSIGNED",
                startedByUserId: support.userId,
            });
            expect(link?.platformAdminId).not.toBe(neel.platformAdminId);
            expect(await ledger(org)).toEqual([
                expect.objectContaining({
                    action: "account-manager.assigned",
                    reason: "Monday share-out",
                    metadata: expect.objectContaining({ via: "share-out" }),
                }),
            ]);
        }
        const summary = await prisma.adminAuditEvent.findFirst({
            where: { action: "account-manager.shared-out" },
            orderBy: { createdAt: "desc" },
        });
        expect(summary?.metadata).toMatchObject({ assigned: 3, left: 0 });
    });

    it("stops at capacity and leaves the rest without a manager", async () => {
        const full = await teammate("Farah", [Roles.AccountManager], {
            capacity: 1,
        });
        await onlyOnCommission(full);
        const a = await business({ createdAt: new Date(Date.now() - DAY_MS) });
        const b = await business();
        const result = await service.shareOut(as(owner), {
            reason: "Share out",
            organizationIds: [a, b],
        });
        expect(result).toEqual({
            assigned: [
                { organizationId: a, platformAdminId: full.platformAdminId },
            ],
            left: 1,
        });
        expect(await managerOf(prisma, b)).toBeNull();
    });

    it("leaves out deleted, leaving and already managed businesses", async () => {
        const one = await teammate("Ira", [Roles.AccountManager]);
        await onlyOnCommission(one);
        const managed = await business();
        await broughtIn(managed, asha);
        const deleted = await business({ status: "DELETED_RETAINED" });
        const leaving = await business({ status: "PENDING_DELETION" });
        const suspended = await business({ status: "SUSPENDED" });
        const result = await service.shareOut(as(owner), {
            reason: "Share out",
            organizationIds: [managed, deleted, leaving, suspended],
        });
        expect(result.assigned).toEqual([
            { organizationId: suspended, platformAdminId: one.platformAdminId },
        ]);
        expect((await managerOf(prisma, managed))?.platformAdminId).toBe(
            asha.platformAdminId,
        );
    });

    it("with nobody on commission, says so and changes nothing", async () => {
        await onlyOnCommission();
        const org = await business();
        await expect(
            service.shareOut(as(owner), {
                reason: "Share out",
                organizationIds: [org],
            }),
        ).rejects.toThrow("nobody to share out to");
        expect(await linksOf(org)).toHaveLength(0);
    });

    it("without a list, every business with no manager gets one", async () => {
        const one = await teammate("Omar", [Roles.AccountManager]);
        await onlyOnCommission(one);
        const org = await business();
        const res = await call("POST", "/team/share-out", support.userId, {
            reason: "Share out everything",
            idempotencyKey: key(),
        });
        expect(res.status).toBe(201);
        expect((await managerOf(prisma, org))?.platformAdminId).toBe(
            one.platformAdminId,
        );
        const open = await prisma.organization.count({
            where: {
                lifecycleStatus: { in: ["ACTIVE", "SUSPENDED"] },
                accountManagerLinks: { none: { endedAt: null } },
                // Omar's own businesses, if any, stay without him.
                memberships: { none: { userId: one.userId } },
            },
        });
        expect(open).toBe(0);
    });
});

describe("links end with the role (U25)", () => {
    it("revoking a teammate ends their links at once, and the businesses show unassigned", async () => {
        const leaving = await teammate("Kiran", [Roles.AccountManager]);
        const a = await business();
        const b = await business();
        await broughtIn(a, leaving);
        await service.assign(as(support), b, {
            platformAdminId: leaving.platformAdminId,
            reason: "Kiran takes it",
        });
        await staffService.revoke({
            staff: as(owner),
            platformAdminId: leaving.platformAdminId,
            reason: "Kiran has left Saroh",
        });
        for (const org of [a, b]) {
            expect(await managerOf(prisma, org)).toBeNull();
            const links = await linksOf(org);
            expect(links.at(-1)).toMatchObject({
                platformAdminId: leaving.platformAdminId,
                endedByUserId: owner.userId,
                endedReason: LINK_END_WORDS.ACCESS_REVOKED,
            });
            expect((await ledger(org)).at(-1)).toMatchObject({
                action: "account-manager.ended",
                actorUserId: owner.userId,
                reason: "Kiran has left Saroh",
                metadata: expect.objectContaining({ cause: "ACCESS_REVOKED" }),
            });
        }
        const revoked = await prisma.adminAuditEvent.findFirst({
            where: {
                action: "staff.revoked",
                targetId: leaving.platformAdminId,
            },
        });
        expect(revoked?.metadata).toMatchObject({ managerLinksEnded: 2 });
    });

    it("an amend that takes the role away ends their links", async () => {
        const moving = await teammate("Leela", [Roles.AccountManager]);
        const org = await business();
        await broughtIn(org, moving);
        await staffService.amend({
            staff: as(owner),
            platformAdminId: moving.platformAdminId,
            roles: [Roles.Support],
            reason: "Leela moves to support",
        });
        expect(await managerOf(prisma, org)).toBeNull();
        expect((await linksOf(org))[0]).toMatchObject({
            endedReason: LINK_END_WORDS.ROLE_REMOVED,
            endedByUserId: owner.userId,
        });
    });

    it("an amend that only changes the role's expiry keeps them", async () => {
        const staying = await teammate("Tara", [Roles.AccountManager]);
        const org = await business();
        await broughtIn(org, staying);
        await staffService.amend({
            staff: as(owner),
            platformAdminId: staying.platformAdminId,
            roles: [Roles.AccountManager, Roles.Support],
            reason: "Tara covers support too, for a month",
            expiresAt: new Date(Date.now() + 30 * DAY_MS),
        });
        expect((await managerOf(prisma, org))?.platformAdminId).toBe(
            staying.platformAdminId,
        );
    });
});
