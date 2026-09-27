/**
 * The customer identity tables against a real Postgres (round-2 plan A, A1;
 * ADR-011, DEC-049): one live account per email per business and per
 * contact, what REMOVED and MERGED do to those, the composite keys that
 * refuse a row mixing two businesses, the cascade from a deleted contact,
 * and the org_isolation policy the migration adds. Runs in the integration
 * project (TEST_DATABASE_URL).
 *
 * The suite builds its database with `db push`, which creates no policy, so
 * the RLS test applies the policy statements from the migration file itself
 * and queries as a NOBYPASSRLS role; `db:verify:replay` is what proves the
 * migration replays. Whether a customer request path sets the context is
 * A3's test.
 */
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

import type { Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { reservedAccountEmail } from "../contacts/contact-email";
import {
    CustomerAccountRepository,
    normaliseAccountEmail,
} from "./customer-account.repository";

const repo = new CustomerAccountRepository();
const PROBE_ROLE = "saroh_rls_probe";

let orgA: string;
let orgB: string;
let siteA: string;
let siteB: string;
let people = 0;

async function makeOrg(name: string): Promise<string> {
    return (
        await prisma.organization.create({
            data: { name, slug: `${name.toLowerCase()}-${process.pid}` },
        })
    ).id;
}

async function makeSite(organizationId: string, slug: string) {
    return (
        await prisma.site.create({
            data: {
                organizationId,
                name: slug,
                slug: `${slug}-${process.pid}`,
            },
        })
    ).id;
}

async function makeContact(organizationId: string, email?: string) {
    people += 1;
    return prisma.contact.create({
        data: {
            organizationId,
            email: email ?? `person${people}@example.in`,
            firstName: "Asha",
        },
    });
}

async function makeAccount(
    organizationId: string,
    contactId: string,
    email: string,
) {
    return repo.create({
        organizationId,
        contactId,
        email,
        verifiedAt: new Date(),
    });
}

beforeAll(async () => {
    orgA = await makeOrg("Kavi");
    orgB = await makeOrg("Pulse");
    siteA = await makeSite(orgA, "kavi");
    siteB = await makeSite(orgB, "pulse");
});

describe("CustomerAccount", () => {
    it("makes an account for a contact, stored with a normalised email", async () => {
        const contact = await makeContact(orgA);
        const account = await makeAccount(
            orgA,
            contact.id,
            "  Asha.Rao@Example.IN ",
        );
        expect(account).toMatchObject({
            organizationId: orgA,
            contactId: contact.id,
            email: "asha.rao@example.in",
            status: "ACTIVE",
            mergedIntoId: null,
            unlinkedFromContactId: null,
        });
        expect(account.emailVerifiedAt).toBeInstanceOf(Date);
        expect(account.linkedAt).toBeInstanceOf(Date);
    });

    it("refuses a second live account for the same contact", async () => {
        const contact = await makeContact(orgA);
        await makeAccount(orgA, contact.id, "first@example.in");
        await expect(
            makeAccount(orgA, contact.id, "second@example.in"),
        ).rejects.toMatchObject({ code: "P2002" });
    });

    it("lets a contact have a new account once the old one is REMOVED", async () => {
        const contact = await makeContact(orgA);
        const old = await makeAccount(orgA, contact.id, "gone@example.in");
        await prisma.customerAccount.update({
            where: { id: old.id },
            data: { status: "REMOVED" },
        });
        await expect(
            makeAccount(orgA, contact.id, "back@example.in"),
        ).resolves.toMatchObject({ status: "ACTIVE" });
    });

    it("allows the same email in two businesses", async () => {
        const a = await makeContact(orgA);
        const b = await makeContact(orgB);
        await makeAccount(orgA, a.id, "both@example.in");
        await expect(
            makeAccount(orgB, b.id, "both@example.in"),
        ).resolves.toMatchObject({ organizationId: orgB });
    });

    it("refuses the same email twice in one business, whatever its case", async () => {
        const one = await makeContact(orgA);
        const two = await makeContact(orgA);
        await makeAccount(orgA, one.id, "twice@example.in");
        await expect(
            makeAccount(orgA, two.id, "TWICE@example.in"),
        ).rejects.toMatchObject({ code: "P2002" });
    });

    it("frees the email when an account is REMOVED", async () => {
        const one = await makeContact(orgA);
        const two = await makeContact(orgA);
        const old = await makeAccount(orgA, one.id, "freed@example.in");
        await prisma.customerAccount.update({
            where: { id: old.id },
            data: { status: "REMOVED" },
        });
        await expect(
            makeAccount(orgA, two.id, "freed@example.in"),
        ).resolves.toMatchObject({ contactId: two.id });
    });

    it("keeps a MERGED account's email reserved", async () => {
        const survivorContact = await makeContact(orgA);
        const loserContact = await makeContact(orgA);
        const survivor = await makeAccount(
            orgA,
            survivorContact.id,
            "survivor@example.in",
        );
        const loser = await makeAccount(
            orgA,
            loserContact.id,
            "kept@example.in",
        );
        await prisma.customerAccount.update({
            where: { id: loser.id },
            data: { status: "MERGED", mergedIntoId: survivor.id },
        });
        const third = await makeContact(orgA);
        await expect(
            makeAccount(orgA, third.id, "kept@example.in"),
        ).rejects.toMatchObject({ code: "P2002" });
    });

    it("gives a separate contact a placeholder email while the account holds the real one", async () => {
        const holder = await makeContact(orgA, "held@example.in");
        const separate = await prisma.contact.create({
            data: { organizationId: orgA, email: `pending-${Date.now()}@x.in` },
        });
        await prisma.contact.update({
            where: { id: separate.id },
            data: { email: reservedAccountEmail(separate.id) },
        });
        const account = await makeAccount(orgA, separate.id, "held@example.in");
        expect(account.email).toBe(holder.email);
        expect(account.contactId).toBe(separate.id);
    });

    it("refuses an account pointing at another business's contact", async () => {
        const theirs = await makeContact(orgB);
        await expect(
            makeAccount(orgA, theirs.id, "cross@example.in"),
        ).rejects.toMatchObject({ code: "P2003" });
    });

    it("refuses a merge into another business's account", async () => {
        const mine = await makeAccount(
            orgA,
            (await makeContact(orgA)).id,
            "mine@example.in",
        );
        const theirs = await makeAccount(
            orgB,
            (await makeContact(orgB)).id,
            "theirs@example.in",
        );
        await expect(
            prisma.customerAccount.update({
                where: { id: mine.id },
                data: { status: "MERGED", mergedIntoId: theirs.id },
            }),
        ).rejects.toMatchObject({ code: "P2003" });
    });

    it("forgets which contact it was unlinked from when that contact is deleted", async () => {
        const wrong = await makeContact(orgA);
        const account = await makeAccount(
            orgA,
            (await makeContact(orgA)).id,
            "unlinked@example.in",
        );
        await prisma.customerAccount.update({
            where: { id: account.id },
            data: { unlinkedFromContactId: wrong.id },
        });
        await prisma.contact.delete({ where: { id: wrong.id } });
        const after = await prisma.customerAccount.findUniqueOrThrow({
            where: { id: account.id },
        });
        expect(after.unlinkedFromContactId).toBeNull();
    });
});

describe("CustomerSession", () => {
    it("refuses a session on another business's site", async () => {
        const account = await makeAccount(
            orgA,
            (await makeContact(orgA)).id,
            "session-cross@example.in",
        );
        await expect(
            prisma.customerSession.create({
                data: {
                    organizationId: orgA,
                    accountId: account.id,
                    siteId: siteB,
                    tokenHash: `hash-cross-${Date.now()}`,
                    expiresAt: new Date(Date.now() + 86_400_000),
                },
            }),
        ).rejects.toMatchObject({ code: "P2003" });
    });

    it("refuses two sessions with one token hash", async () => {
        const account = await makeAccount(
            orgA,
            (await makeContact(orgA)).id,
            "token@example.in",
        );
        const data = {
            organizationId: orgA,
            accountId: account.id,
            siteId: siteA,
            tokenHash: "same-token-hash",
            expiresAt: new Date(Date.now() + 86_400_000),
        };
        await prisma.customerSession.create({ data });
        await expect(
            prisma.customerSession.create({ data }),
        ).rejects.toMatchObject({ code: "P2002" });
    });

    it("goes with its account when the contact is deleted", async () => {
        const contact = await makeContact(orgA);
        const account = await makeAccount(
            orgA,
            contact.id,
            "cascade@example.in",
        );
        await prisma.customerSession.create({
            data: {
                organizationId: orgA,
                accountId: account.id,
                siteId: siteA,
                tokenHash: `hash-cascade-${Date.now()}`,
                expiresAt: new Date(Date.now() + 86_400_000),
            },
        });
        await prisma.contact.delete({ where: { id: contact.id } });
        expect(
            await prisma.customerAccount.count({ where: { id: account.id } }),
        ).toBe(0);
        expect(
            await prisma.customerSession.count({
                where: { accountId: account.id },
            }),
        ).toBe(0);
    });
});

describe("A booking made signed in (A9)", () => {
    // The key is single-column SET NULL so it runs on PostgreSQL 14; a
    // composite SET NULL would also null the booking's required organization
    // and the delete would fail (review M-4).
    it("keeps the booking, without its contact or account, when the contact is deleted", async () => {
        const contact = await makeContact(orgA);
        const account = await makeAccount(
            orgA,
            contact.id,
            "booked-signed-in@example.in",
        );
        const service = await prisma.service.create({
            data: {
                organizationId: orgA,
                name: "Morning yoga",
                durationMinutes: 60,
                timezone: "UTC",
            },
        });
        const startAt = new Date(Date.now() + 86_400_000);
        const booking = await prisma.booking.create({
            data: {
                organizationId: orgA,
                serviceId: service.id,
                contactId: contact.id,
                customerAccountId: account.id,
                startAt,
                endAt: new Date(startAt.getTime() + 3_600_000),
                timezone: "UTC",
                snapshot: {},
            },
        });

        await prisma.contact.delete({ where: { id: contact.id } });

        expect(
            await prisma.customerAccount.count({ where: { id: account.id } }),
        ).toBe(0);
        expect(
            await prisma.booking.findUnique({
                where: { id: booking.id },
                select: {
                    organizationId: true,
                    contactId: true,
                    customerAccountId: true,
                },
            }),
        ).toEqual({
            organizationId: orgA,
            contactId: null,
            customerAccountId: null,
        });
    });
});

describe("Contact verified-email stamp", () => {
    it("starts unverified and records how it was verified", async () => {
        const contact = await makeContact(orgA);
        expect(contact.emailVerifiedAt).toBeNull();
        expect(contact.emailVerifiedVia).toBeNull();
        const at = new Date();
        const stamped = await prisma.contact.update({
            where: { id: contact.id },
            data: { emailVerifiedAt: at, emailVerifiedVia: "SIGN_IN_CODE" },
        });
        expect(stamped.emailVerifiedAt?.getTime()).toBe(at.getTime());
        expect(stamped.emailVerifiedVia).toBe("SIGN_IN_CODE");
    });
});

describe("CustomerAccountRepository", () => {
    it("finds a live account by email in its business only, whatever the case", async () => {
        const contact = await makeContact(orgA);
        const account = await makeAccount(orgA, contact.id, "find@example.in");
        await expect(
            repo.findLiveByEmail(orgA, " FIND@example.in"),
        ).resolves.toMatchObject({ id: account.id });
        await expect(
            repo.findLiveByEmail(orgB, "find@example.in"),
        ).resolves.toBeNull();
        await expect(
            repo.findLiveForContact(orgA, contact.id),
        ).resolves.toMatchObject({ id: account.id });
        await expect(
            repo.findLiveForContact(orgB, contact.id),
        ).resolves.toBeNull();
    });

    it("finds a MERGED account but not a REMOVED one", async () => {
        const merged = await makeAccount(
            orgA,
            (await makeContact(orgA)).id,
            "repo-merged@example.in",
        );
        await prisma.customerAccount.update({
            where: { id: merged.id },
            data: { status: "MERGED" },
        });
        const removed = await makeAccount(
            orgA,
            (await makeContact(orgA)).id,
            "repo-removed@example.in",
        );
        await prisma.customerAccount.update({
            where: { id: removed.id },
            data: { status: "REMOVED" },
        });
        await expect(
            repo.findLiveByEmail(orgA, "repo-merged@example.in"),
        ).resolves.toMatchObject({ status: "MERGED" });
        await expect(
            repo.findLiveByEmail(orgA, "repo-removed@example.in"),
        ).resolves.toBeNull();
    });

    it("normalises an email by trimming and lower-casing it", () => {
        expect(normaliseAccountEmail("  Asha@Kavi.IN ")).toBe("asha@kavi.in");
    });
});

describe("org_isolation on the customer tables", () => {
    const TABLES = [
        "CustomerAccount",
        "CustomerSignInCode",
        "CustomerSession",
    ] as const;

    /** The migration's own RLS statements, so this checks what ships. */
    function policyStatements(): string[] {
        const dir = path.resolve(
            __dirname,
            "../../../../../packages/database/prisma/migrations",
        );
        const folder = readdirMigration(dir);
        const sql = readFileSync(
            path.join(dir, folder, "migration.sql"),
            "utf8",
        );
        const start = sql.indexOf("-- Row-level security");
        expect(start).toBeGreaterThan(0);
        return sql
            .slice(start)
            .split(/;\s*\n/)
            .map((s) =>
                s
                    .split("\n")
                    .filter((line) => !line.trim().startsWith("--"))
                    .join("\n")
                    .trim(),
            )
            .filter(Boolean);
    }

    function readdirMigration(dir: string): string {
        const found = readdirSync(dir).filter((name) =>
            name.endsWith("_customer_accounts"),
        );
        expect(found).toHaveLength(1);
        return found[0];
    }

    /** Run `fn` as a role that RLS applies to, in `orgId`'s context. */
    async function asTenant<T>(
        orgId: string,
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
        const before = process.env.RLS_ENFORCEMENT;
        // eslint-disable-next-line no-restricted-properties -- the proxy reads this live
        process.env.RLS_ENFORCEMENT = "on";
        try {
            return await runInOrgContext(orgId, () =>
                prisma.$transaction(async (tx) => {
                    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${PROBE_ROLE}`);
                    return fn(tx);
                }),
            );
        } finally {
            // eslint-disable-next-line no-restricted-properties -- restore what the test changed
            if (before === undefined) delete process.env.RLS_ENFORCEMENT;
            // eslint-disable-next-line no-restricted-properties -- restore what the test changed
            else process.env.RLS_ENFORCEMENT = before;
        }
    }

    beforeAll(async () => {
        for (const table of TABLES) {
            await prisma.$executeRawUnsafe(
                `DROP POLICY IF EXISTS "org_isolation" ON "${table}"`,
            );
        }
        for (const statement of policyStatements()) {
            await prisma.$executeRawUnsafe(statement);
        }
        await prisma.$executeRawUnsafe(
            `DO $$ BEGIN
               IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN
                 CREATE ROLE ${PROBE_ROLE} NOLOGIN NOBYPASSRLS;
               END IF;
             END $$`,
        );
        await prisma.$executeRawUnsafe(
            `GRANT USAGE ON SCHEMA public TO ${PROBE_ROLE}`,
        );
        for (const table of TABLES) {
            await prisma.$executeRawUnsafe(
                `GRANT SELECT, INSERT ON "${table}" TO ${PROBE_ROLE}`,
            );
        }
    });

    it("hides another business's accounts, codes and sessions", async () => {
        for (const [org, site] of [
            [orgA, siteA],
            [orgB, siteB],
        ] as const) {
            const account = await makeAccount(
                org,
                (await makeContact(org)).id,
                `rls-${org}@example.in`,
            );
            await prisma.customerSignInCode.create({
                data: {
                    organizationId: org,
                    destinationHash: `dest-${org}`,
                    codeHash: `code-${org}`,
                    expiresAt: new Date(Date.now() + 600_000),
                },
            });
            await prisma.customerSession.create({
                data: {
                    organizationId: org,
                    accountId: account.id,
                    siteId: site,
                    tokenHash: `rls-token-${org}`,
                    expiresAt: new Date(Date.now() + 86_400_000),
                },
            });
        }

        const seen = await asTenant(orgA, async (tx) => ({
            accounts: await tx.customerAccount.findMany({
                select: { organizationId: true },
            }),
            codes: await tx.customerSignInCode.findMany({
                select: { organizationId: true },
            }),
            sessions: await tx.customerSession.findMany({
                select: { organizationId: true },
            }),
        }));
        for (const rows of [seen.accounts, seen.codes, seen.sessions]) {
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
        }

        // Outside any context the rows of both are there (jobs, public paths).
        const all = await prisma.customerSignInCode.findMany({
            where: {
                destinationHash: { in: [`dest-${orgA}`, `dest-${orgB}`] },
            },
        });
        expect(all).toHaveLength(2);
    });

    it("refuses to write a row for another business", async () => {
        await expect(
            asTenant(orgA, (tx) =>
                tx.customerSignInCode.create({
                    data: {
                        organizationId: orgB,
                        destinationHash: "dest-smuggled",
                        codeHash: "code-smuggled",
                        expiresAt: new Date(Date.now() + 600_000),
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/i);
    });
});
