/**
 * Who brought a business in (DEC-169, admin console U19) against a real
 * Postgres: the `?am=` link, a typed code and a lead's email recorded before
 * the business each start a BROUGHT_IN link in the business's create
 * transaction, with their evidence; a later email, a staff-verified one, an
 * unknown or revoked manager's code start none and the business is still
 * made; the link beats a lead's email; a business referral is recorded
 * beside it; one open link per business; an ended link never changes; a
 * business reads only its own links.
 *
 * The integration schema is built by `prisma db push`, which carries no
 * CHECK and no trigger. The CHECK and append-only tests add the
 * migration's own SQL when the database lacks it, so they prove the
 * migration, not a copy. Under `TEST_RLS=on` the migrations are replayed
 * and the policy applies.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma, runInOrgContext } from "@saroh/database";

import { AdminRole } from "../admin/admin-permissions";
import { generateManagerCode } from "../admin/staff-profile";
import { maySeeOrganization } from "../admin/staff-scope";
import { AuditService } from "../audit/audit.service";
import { newRefCode, normaliseEmail } from "../waitlist/waitlist-keys";
import { OrganizationOnboardingService } from "./organization-onboarding.service";

const onboarding = new OrganizationOnboardingService(new AuditService());

const tag = `${process.pid}x${Date.now()}`;
let seq = 0;
const uniq = (label: string) => `${label}${tag}x${++seq}`;
const email = (label: string) => `${uniq(label)}@example.com`;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A person, self-verified unless a test says otherwise. */
async function person(
    input: { email?: string; verifiedByStaff?: boolean } = {},
): Promise<{ id: string; email: string }> {
    const address = input.email ?? email("owner-");
    const user = await prisma.user.create({
        data: {
            email: address,
            emailVerified: true,
            ...(input.verifiedByStaff
                ? { emailVerifiedByStaffAt: new Date() }
                : {}),
        },
        select: { id: true, email: true },
    });
    return user;
}

interface Manager {
    platformAdminId: string;
    userId: string;
    code: string;
}

/** A teammate with a manager code and, unless said, the Account manager role. */
async function manager(
    input: {
        role?: string;
        revoked?: boolean;
        expired?: boolean;
        accessRevoked?: boolean;
    } = {},
): Promise<Manager> {
    const user = await person({ email: email("am-") });
    const now = Date.now();
    const admin = await prisma.platformAdmin.create({
        data: {
            userId: user.id,
            revokedAt: input.accessRevoked ? new Date(now - DAY_MS) : null,
            roleAssignments: {
                create: {
                    role: input.role ?? AdminRole.AccountManager,
                    reason: "test grant",
                    revokedAt: input.revoked ? new Date(now - DAY_MS) : null,
                    expiresAt: input.expired ? new Date(now - DAY_MS) : null,
                },
            },
        },
        select: { id: true },
    });
    const code = generateManagerCode();
    await prisma.staffProfile.create({
        data: {
            platformAdminId: admin.id,
            worksAs: "ACCOUNT_MANAGER_JOB",
            managerCode: code,
            onCommission: true,
        },
    });
    return { platformAdminId: admin.id, userId: user.id, code };
}

/** A lead owned by `owner`, holding `address` recorded at `at`. */
async function lead(
    owner: Manager,
    address: string,
    at: Date,
    field: "email" | "signUpEmail" = "email",
): Promise<string> {
    const { email: stored, key } = normaliseEmail(address);
    const row = await prisma.sarohLead.create({
        data: {
            name: "Pulse Studio",
            source: "ADDED",
            ownerPlatformAdminId: owner.platformAdminId,
            ownerSince: at,
            ownedHow: "ADDED",
            ...(field === "email"
                ? { email: stored, emailKey: key, emailAt: at }
                : {
                      signUpEmail: stored,
                      signUpEmailKey: key,
                      signUpEmailAt: at,
                  }),
        },
        select: { id: true },
    });
    return row.id;
}

const make = (
    ownerId: string,
    carried: {
        managerLinkCode?: string;
        managerLinkSetAt?: string;
        managerCode?: string;
        referralCode?: string;
    } = {},
) =>
    onboarding.onboard(ownerId, {
        name: "Pulse Studio",
        address: uniq("pulse-"),
        ...carried,
    });

const links = (organizationId: string) =>
    prisma.accountManagerLink.findMany({
        where: { organizationId },
        orderBy: { startedAt: "asc" },
    });

const MIGRATION = join(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20261129200000_account_manager_links/migration.sql",
);

/** The migration's SQL between two markers, or the CHECK statements. */
function migrationPart(kind: "checks" | "append-only"): string[] {
    const sql = readFileSync(MIGRATION, "utf8");
    if (kind === "append-only") {
        const start = sql.indexOf("-- append-only:begin");
        const end = sql.indexOf("-- append-only:end");
        return [sql.slice(start, end)];
    }
    // Comments first: one holds a semicolon.
    return sql
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) =>
            /ADD CONSTRAINT "AccountManagerLink_\w+_check"/.test(statement),
        );
}

async function hasConstraint(name: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM pg_constraint WHERE conname = ${name}`;
    return Number(rows[0]?.n ?? 0) > 0;
}

async function hasTrigger(): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM pg_trigger
        WHERE tgname = 'AccountManagerLink_append_only'`;
    return Number(rows[0]?.n ?? 0) > 0;
}

describe("who brought a business in (real database, DEC-169)", () => {
    it("?am= starts a BROUGHT_IN link via LINK, with when the cookie was kept", async () => {
        const asha = await manager();
        const owner = await person();
        const keptAt = new Date(Date.now() - 2 * DAY_MS).toISOString();

        const made = await make(owner.id, {
            managerLinkCode: asha.code.toLowerCase(),
            managerLinkSetAt: keptAt,
        });

        const rows = await links(made.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            platformAdminId: asha.platformAdminId,
            source: "LINK",
            kind: "BROUGHT_IN",
            endedAt: null,
            startedByUserId: null,
            evidence: {
                source: "LINK",
                code: asha.code,
                cookieSetAt: keptAt,
            },
        });
        // From the moment the business was made.
        const org = await prisma.organization.findUniqueOrThrow({
            where: { id: made.id },
            select: { createdAt: true },
        });
        expect(rows[0]?.startedAt.getTime()).toBe(org.createdAt.getTime());

        // The manager now sees the business; another doesn't.
        const ravi = await manager();
        await expect(
            maySeeOrganization(
                { kind: "own", platformAdminId: asha.platformAdminId },
                made.id,
            ),
        ).resolves.toBe(true);
        await expect(
            maySeeOrganization(
                { kind: "own", platformAdminId: ravi.platformAdminId },
                made.id,
            ),
        ).resolves.toBe(false);
    });

    it("a typed code starts one via CODE", async () => {
        const asha = await manager();

        const made = await make((await person()).id, {
            managerCode: ` ${asha.code.slice(0, 4)}-${asha.code.slice(4)} `,
        });

        const rows = await links(made.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            platformAdminId: asha.platformAdminId,
            source: "CODE",
            kind: "BROUGHT_IN",
            evidence: { source: "CODE", code: asha.code },
        });
    });

    it("a self-verified email on a lead recorded before the business starts one via LEAD_EMAIL", async () => {
        const ravi = await manager();
        const owner = await person();
        const recordedAt = new Date(Date.now() - 3 * DAY_MS);
        const leadId = await lead(ravi, owner.email, recordedAt);

        const made = await make(owner.id);

        const rows = await links(made.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            platformAdminId: ravi.platformAdminId,
            source: "LEAD_EMAIL",
            kind: "BROUGHT_IN",
            evidence: {
                source: "LEAD_EMAIL",
                leadId,
                leadField: "email",
                emailRecordedAt: recordedAt.toISOString(),
            },
        });
        // The evidence never holds the email itself.
        expect(JSON.stringify(rows[0]?.evidence)).not.toContain("example.com");
    });

    it("counts a lead's sign-up email the same way", async () => {
        const ravi = await manager();
        const owner = await person();
        await lead(
            ravi,
            owner.email,
            new Date(Date.now() - DAY_MS),
            "signUpEmail",
        );

        const made = await make(owner.id);

        expect((await links(made.id))[0]).toMatchObject({
            platformAdminId: ravi.platformAdminId,
            source: "LEAD_EMAIL",
            evidence: { leadField: "signUpEmail" },
        });
    });

    it("an email recorded after the business was made doesn't count", async () => {
        const ravi = await manager();
        const owner = await person();

        const made = await make(owner.id);
        await lead(ravi, owner.email, new Date());

        expect(await links(made.id)).toEqual([]);

        // Nor for a business made before it, by the same owner, read again.
        const org = await prisma.organization.findUniqueOrThrow({
            where: { id: made.id },
            select: { createdAt: true },
        });
        const later = await prisma.sarohLead.findFirstOrThrow({
            where: { emailKey: normaliseEmail(owner.email).key },
            select: { emailAt: true },
        });
        expect(later.emailAt!.getTime()).toBeGreaterThanOrEqual(
            org.createdAt.getTime(),
        );
    });

    it("a staff-verified email doesn't count", async () => {
        const ravi = await manager();
        const owner = await person({ verifiedByStaff: true });
        await lead(ravi, owner.email, new Date(Date.now() - 3 * DAY_MS));

        const made = await make(owner.id);

        expect(await links(made.id)).toEqual([]);
    });

    it("the link wins when it and a lead's email name different managers", async () => {
        const asha = await manager();
        const ravi = await manager();
        const owner = await person();
        await lead(ravi, owner.email, new Date(Date.now() - 10 * DAY_MS));

        const made = await make(owner.id, { managerLinkCode: asha.code });

        const rows = await links(made.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            platformAdminId: asha.platformAdminId,
            source: "LINK",
        });
    });

    it("records ?am= and ?ref= both", async () => {
        const asha = await manager();
        const referrerOwner = await person();
        const referrer = await make(referrerOwner.id);
        const refCode = newRefCode();
        await prisma.organization.update({
            where: { id: referrer.id },
            data: { referralCode: refCode },
        });

        const made = await make((await person()).id, {
            managerLinkCode: asha.code,
            referralCode: refCode,
        });

        const org = await prisma.organization.findUniqueOrThrow({
            where: { id: made.id },
            select: { referredByOrganizationId: true },
        });
        expect(org.referredByOrganizationId).toBe(referrer.id);
        expect(await links(made.id)).toEqual([
            expect.objectContaining({
                platformAdminId: asha.platformAdminId,
                source: "LINK",
            }),
        ]);
    });

    it.each([
        ["an unknown code", {}],
        ["a revoked manager's", { revoked: true }],
        ["an expired manager's", { expired: true }],
        ["a teammate whose access was revoked", { accessRevoked: true }],
        [
            "a teammate who isn't an Account manager",
            { role: AdminRole.Support },
        ],
    ] as const)(
        "links nobody for %s code, and still makes the business",
        async (_label, kind) => {
            const someone = await manager(kind);
            const code =
                _label === "an unknown code"
                    ? generateManagerCode()
                    : someone.code;

            const made = await make((await person()).id, {
                managerLinkCode: code,
                managerCode: code,
            });

            await expect(
                prisma.organization.findUnique({ where: { id: made.id } }),
            ).resolves.not.toBeNull();
            expect(await links(made.id)).toEqual([]);
        },
    );

    it("never links a manager to a business of their own", async () => {
        const asha = await manager();

        const made = await make(asha.userId, { managerCode: asha.code });

        expect(await links(made.id)).toEqual([]);
    });

    it("refuses a second open link, and takes one once the first has ended", async () => {
        const asha = await manager();
        const ravi = await manager();
        const made = await make((await person()).id, {
            managerCode: asha.code,
        });

        await expect(
            prisma.accountManagerLink.create({
                data: {
                    organizationId: made.id,
                    platformAdminId: ravi.platformAdminId,
                    source: "ASSIGNED",
                    kind: "ASSIGNED",
                },
            }),
        ).rejects.toMatchObject({ code: "P2002" });

        const [first] = await links(made.id);
        await prisma.accountManagerLink.update({
            where: { id: first!.id },
            data: {
                endedAt: new Date(),
                endedReason: "Moved to another manager",
            },
        });
        await prisma.accountManagerLink.create({
            data: {
                organizationId: made.id,
                platformAdminId: ravi.platformAdminId,
                source: "ASSIGNED",
                kind: "ASSIGNED",
            },
        });

        // The history is kept: both, one open.
        const rows = await links(made.id);
        expect(
            rows.map((row) => [row.platformAdminId, row.endedAt === null]),
        ).toEqual([
            [asha.platformAdminId, false],
            [ravi.platformAdminId, true],
        ]);
    });

    // Needs DDL to force the failure, which the RLS run's DML-only role
    // can't do; the savepoint's handling is in `account-manager.spec.ts`.
    const ownerRun = !["1", "on", "true"].includes(
        (process.env.TEST_RLS ?? "").trim().toLowerCase(),
    );
    (ownerRun ? it : it.skip)(
        "an attribution that fails is rolled back to its savepoint, and the business is made",
        async () => {
            const asha = await manager();
            const owner = await person();
            // A link's insert that fails, whatever the reason: forced here by a
            // constraint that refuses every new row.
            await prisma.$executeRawUnsafe(
                `ALTER TABLE "AccountManagerLink" ADD CONSTRAINT "test_refuse_all" CHECK (false) NOT VALID`,
            );
            try {
                const made = await make(owner.id, { managerCode: asha.code });

                await expect(
                    prisma.organization.findUnique({ where: { id: made.id } }),
                ).resolves.not.toBeNull();
                await expect(
                    prisma.membership.count({
                        where: { organizationId: made.id },
                    }),
                ).resolves.toBe(1);
                expect(await links(made.id)).toEqual([]);
            } finally {
                await prisma.$executeRawUnsafe(
                    `ALTER TABLE "AccountManagerLink" DROP CONSTRAINT "test_refuse_all"`,
                );
            }
        },
    );

    it("the migration's CHECKs refuse a kind that doesn't match its source, and an end with no reason", async () => {
        if (!(await hasConstraint("AccountManagerLink_kind_source_check"))) {
            for (const statement of migrationPart("checks")) {
                await prisma.$executeRawUnsafe(statement);
            }
        }
        const asha = await manager();
        const made = await make((await person()).id);

        await expect(
            prisma.accountManagerLink.create({
                data: {
                    organizationId: made.id,
                    platformAdminId: asha.platformAdminId,
                    source: "CODE",
                    kind: "ASSIGNED",
                },
            }),
        ).rejects.toThrow(/AccountManagerLink_kind_source_check/);
        await expect(
            prisma.accountManagerLink.create({
                data: {
                    organizationId: made.id,
                    platformAdminId: asha.platformAdminId,
                    source: "SHARED",
                    kind: "BROUGHT_IN",
                },
            }),
        ).rejects.toThrow(/AccountManagerLink_source_check/);
        await expect(
            prisma.accountManagerLink.create({
                data: {
                    organizationId: made.id,
                    platformAdminId: asha.platformAdminId,
                    source: "ASSIGNED",
                    kind: "ASSIGNED",
                    endedAt: new Date(Date.now() + DAY_MS),
                },
            }),
        ).rejects.toThrow(/AccountManagerLink_ended_reason_check/);
    });

    it("an open link can only be ended, and an ended one never changes", async () => {
        if (!(await hasTrigger())) {
            for (const statement of migrationPart("append-only")) {
                await prisma.$executeRawUnsafe(statement);
            }
        }
        const asha = await manager();
        const ravi = await manager();
        const made = await make((await person()).id, {
            managerCode: asha.code,
        });
        const [link] = await links(made.id);

        await expect(
            prisma.accountManagerLink.update({
                where: { id: link!.id },
                data: { platformAdminId: ravi.platformAdminId },
            }),
        ).rejects.toThrow(/can only be ended/);
        await expect(
            prisma.accountManagerLink.update({
                where: { id: link!.id },
                data: { evidence: { source: "CODE", code: ravi.code } },
            }),
        ).rejects.toThrow(/can only be ended/);

        await prisma.accountManagerLink.update({
            where: { id: link!.id },
            data: { endedAt: new Date(), endedReason: "Role ended" },
        });
        await expect(
            prisma.accountManagerLink.update({
                where: { id: link!.id },
                data: { endedReason: "Something else" },
            }),
        ).rejects.toThrow(/has ended and cannot change/);
    });

    it("a business reads only its own links", async () => {
        const asha = await manager();
        const mine = await make((await person()).id, {
            managerCode: asha.code,
        });
        const theirs = await make((await person()).id, {
            managerCode: asha.code,
        });

        const seen = await runInOrgContext(mine.id, () =>
            prisma.accountManagerLink.findMany({
                where: { organizationId: { in: [mine.id, theirs.id] } },
                select: { organizationId: true },
            }),
        );

        // Under TEST_RLS=on the policy hides the other business's link; in
        // the plain run there is no policy and both are seen.
        const rls = ["1", "on", "true"].includes(
            (process.env.TEST_RLS ?? "").trim().toLowerCase(),
        );
        expect(seen.map((row) => row.organizationId).sort()).toEqual(
            rls ? [mine.id] : [mine.id, theirs.id].sort(),
        );
    });
});
