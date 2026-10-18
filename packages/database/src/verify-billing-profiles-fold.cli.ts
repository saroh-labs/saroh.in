import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

/**
 * The billing profiles migration's data move (DEC-167,
 * `20261126100000_billing_profiles`), run against rows.
 *
 * The replay (`verify-migration-replay.cli.ts`) runs every migration on an
 * empty database, so the SQL that decides which businesses share a profile,
 * and which legal name, GSTIN, address and provider customer each profile
 * inherits, never meets a row there. A mistake in it bills a business to
 * another's GSTIN, or merges two owners' businesses, and can't be undone on
 * production data. So this builds the schema as it was just before the
 * migration in a scratch database, writes businesses that exercise each
 * rule, applies the migration and checks what it made:
 *
 * - an owner's businesses with the same legal name and GSTIN share one
 *   profile; one with another GSTIN is left without one;
 * - the profile's details are the oldest business's, and its customer the
 *   oldest joined business's that has one (another stays put);
 * - two owners of one business: the first owner's profile bills it, and
 *   the second gets none from it;
 * - a business with no owner is left without one;
 * - the sign-in email, trimmed and lower-cased, is the billing email;
 * - a GSTIN is copied only while the business is GST-registered.
 *
 * MIGFOLD_DATABASE_URL names the scratch database; its name must contain
 * "test" (or be named again in MIGFOLD_DATABASE_CONFIRM, as CI's is). Its
 * `public` schema is dropped and rebuilt every run. Run by
 * `pnpm check:migration-fold`: by `scripts/prepush.sh` and CI's migration
 * replay job, after the replay, when a migration changed.
 */

const TARGET = "20261126100000_billing_profiles";
const migrations = resolve(__dirname, "..", "prisma", "migrations");

function fail(message: string): never {
    console.error(`\n${message}\n`);
    process.exit(1);
}

const url = process.env.MIGFOLD_DATABASE_URL;
if (!url) {
    fail(
        'MIGFOLD_DATABASE_URL is not set. This check needs a scratch database whose name contains "test".',
    );
}
const database = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
// CI's throwaway database is named apart; it is named here explicitly.
if (
    !database.includes("test") &&
    database !== process.env.MIGFOLD_DATABASE_CONFIRM
) {
    fail(
        `"${database}" is not a scratch database: its name must contain "test".`,
    );
}

const sqlOf = (dir: string) =>
    readFileSync(resolve(migrations, dir, "migration.sql"), "utf8");

const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.UTC(2026, 0, 1) + days * DAY);

async function main(): Promise<void> {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
        await client.query(
            "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;",
        );
        const before = readdirSync(migrations, { withFileTypes: true })
            .filter((d) => d.isDirectory() && d.name < TARGET)
            .map((d) => d.name)
            .sort();
        for (const dir of before) {
            try {
                await client.query(sqlOf(dir));
            } catch (error) {
                fail(
                    `Migration ${dir} did not apply: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
        await fixtures(client);
        await client.query(sqlOf(TARGET));
        await check(client);
    } finally {
        await client.end();
    }
    console.log(
        `The billing profiles migration's data move gives each business the profile it should (${database}).`,
    );
}

async function user(c: Client, id: string, email: string): Promise<void> {
    await c.query(
        `INSERT INTO "User" ("id", "email", "name", "updatedAt") VALUES ($1, $2, $3, now())`,
        [id, email, id],
    );
}

async function business(
    c: Client,
    id: string,
    name: string,
    createdAt: Date,
    profile: {
        legalName?: string | null;
        gstRegistered?: boolean;
        taxId?: string | null;
        gstState?: string | null;
        addressLine1?: string | null;
        city?: string | null;
        postalCode?: string | null;
        phone?: string | null;
    } | null,
): Promise<void> {
    await c.query(
        `INSERT INTO "Organization" ("id", "name", "slug", "createdAt") VALUES ($1, $2, $3, $4)`,
        [id, name, id, createdAt],
    );
    if (!profile) return;
    await c.query(
        `INSERT INTO "BusinessProfile" ("id", "organizationId", "legalName", "gstRegistered", "taxId",
             "gstState", "addressLine1", "city", "postalCode", "phone", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
        [
            `bp_${id}`,
            id,
            profile.legalName ?? null,
            profile.gstRegistered ?? false,
            profile.taxId ?? null,
            profile.gstState ?? null,
            profile.addressLine1 ?? null,
            profile.city ?? null,
            profile.postalCode ?? null,
            profile.phone ?? null,
        ],
    );
}

async function member(
    c: Client,
    organizationId: string,
    userId: string,
    role: string,
    createdAt: Date,
): Promise<void> {
    await c.query(
        `INSERT INTO "Membership" ("id", "organizationId", "userId", "role", "createdAt")
         VALUES ($1, $2, $3, $4, $5)`,
        [
            `m_${organizationId}_${userId}`,
            organizationId,
            userId,
            role,
            createdAt,
        ],
    );
}

async function customer(
    c: Client,
    organizationId: string,
    providerCustomerId: string,
    contactWithheld = false,
): Promise<void> {
    await c.query(
        `INSERT INTO "BillingCustomer" ("id", "organizationId", "provider", "providerCustomerId",
             "contactWithheld", "syncedAt", "updatedAt")
         VALUES ($1, $2, 'RAZORPAY', $3, $4, now(), now())`,
        [
            `bc_${organizationId}`,
            organizationId,
            providerCustomerId,
            contactWithheld,
        ],
    );
}

const ASHA = {
    legalName: "Asha Foods Pvt Ltd",
    gstRegistered: true,
    taxId: " 29ABCDE1234F1Z5 ",
    gstState: "29",
};

async function fixtures(c: Client): Promise<void> {
    // Asha: three businesses with one GST identity, one with another.
    await user(c, "u_asha", "  Asha@Example.COM ");
    await business(c, "o_asha_1", "Asha's Kitchen", at(0), {
        ...ASHA,
        addressLine1: "3 Hill Road",
        city: "Bengaluru",
        postalCode: "560038",
        phone: "+919800000001",
    });
    await business(c, "o_asha_2", "Asha's Bakery", at(10), {
        ...ASHA,
        addressLine1: "9 Lake Road",
        city: "Mysuru",
        postalCode: "570001",
    });
    await business(c, "o_asha_3", "Asha's Cafe", at(20), { ...ASHA });
    await business(c, "o_asha_pune", "Asha's Pune Kitchen", at(30), {
        ...ASHA,
        taxId: "27ABCDE1234F1Z5",
        gstState: "27",
    });
    for (const [org, day] of [
        ["o_asha_1", 0],
        ["o_asha_2", 10],
        ["o_asha_3", 20],
        ["o_asha_pune", 30],
    ] as const) {
        await member(c, org, "u_asha", "OWNER", at(day));
    }
    // The oldest joined business with a customer is the second; the third's
    // and the one left out's stay on their rows.
    await customer(c, "o_asha_2", "cust_asha_2", true);
    await customer(c, "o_asha_3", "cust_asha_3");
    await customer(c, "o_asha_pune", "cust_asha_pune");

    // Bina's studio has two owners, Bina first; it says it isn't
    // GST-registered, though a GSTIN is typed; no legal name.
    await user(c, "u_bina", "bina@example.com");
    await user(c, "u_chen", "chen@example.com");
    await business(c, "o_bina", "Bina Studio", at(5), {
        legalName: "  ",
        gstRegistered: false,
        taxId: "29XYZAB1234C1Z5",
        gstState: "29",
    });
    await member(c, "o_bina", "u_bina", "OWNER", at(5));
    await member(c, "o_bina", "u_chen", "OWNER", at(6));

    // A business with no owner, only an admin; and one with no details.
    await user(c, "u_dev", "dev@example.com");
    await business(c, "o_ownerless", "Ownerless", at(7), { ...ASHA });
    await member(c, "o_ownerless", "u_dev", "ADMIN", at(7));
    await user(c, "u_esha", "esha@example.com");
    await business(c, "o_bare", "Esha Bare", at(8), null);
    await member(c, "o_bare", "u_esha", "OWNER", at(8));
}

interface ProfileRow {
    id: string;
    ownerUserId: string;
    legalName: string;
    gstin: string | null;
    gstState: string | null;
    addressLine1: string | null;
    city: string | null;
    postalCode: string | null;
    billingEmail: string;
    phone: string | null;
    provider: string;
    providerCustomerId: string | null;
    contactWithheld: boolean;
}

async function check(c: Client): Promise<void> {
    const profiles = (
        await c.query<ProfileRow>(
            `SELECT * FROM "BillingProfile" ORDER BY "ownerUserId"`,
        )
    ).rows;
    const pointed = Object.fromEntries(
        (
            await c.query<{ id: string; billingProfileId: string | null }>(
                `SELECT "id", "billingProfileId" FROM "Organization"`,
            )
        ).rows.map((r) => [r.id, r.billingProfileId]),
    );
    const of = (owner: string) =>
        profiles.filter((p) => p.ownerUserId === owner);

    assert.deepEqual(
        profiles.map((p) => p.ownerUserId),
        ["u_asha", "u_bina", "u_esha"],
        "one profile per owner of a business, none for a second owner or an admin",
    );
    for (const p of profiles) {
        assert.match(p.id, /^bprof_[0-9a-f]{32}$/, "a profile's id");
        assert.equal(p.provider, "RAZORPAY");
    }

    const [asha] = of("u_asha");
    assert.ok(asha);
    assert.deepEqual(
        {
            legalName: asha.legalName,
            gstin: asha.gstin,
            gstState: asha.gstState,
            addressLine1: asha.addressLine1,
            city: asha.city,
            postalCode: asha.postalCode,
            billingEmail: asha.billingEmail,
            phone: asha.phone,
            providerCustomerId: asha.providerCustomerId,
            contactWithheld: asha.contactWithheld,
        },
        {
            legalName: "Asha Foods Pvt Ltd",
            gstin: "29ABCDE1234F1Z5",
            gstState: "29",
            addressLine1: "3 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
            billingEmail: "asha@example.com",
            phone: "+919800000001",
            providerCustomerId: "cust_asha_2",
            contactWithheld: true,
        },
        "Asha's profile: the oldest business's details, the oldest joined customer, the email trimmed and lower-cased",
    );
    assert.equal(pointed.o_asha_1, asha.id, "the oldest business joins");
    assert.equal(pointed.o_asha_2, asha.id, "the same GST identity joins");
    assert.equal(pointed.o_asha_3, asha.id, "the same GST identity joins");
    assert.equal(
        pointed.o_asha_pune,
        null,
        "another GSTIN is left without a profile",
    );

    const [bina] = of("u_bina");
    assert.ok(bina);
    assert.equal(
        bina.legalName,
        "Bina Studio",
        "no legal name: the business's",
    );
    assert.equal(bina.gstin, null, "not GST-registered: no GSTIN copied");
    assert.equal(bina.billingEmail, "bina@example.com");
    assert.equal(bina.providerCustomerId, null);
    assert.equal(
        pointed.o_bina,
        bina.id,
        "billed to its first owner's profile",
    );
    assert.equal(of("u_chen").length, 0, "a second owner gets none from it");

    assert.equal(pointed.o_ownerless, null, "no owner: no profile");
    const [esha] = of("u_esha");
    assert.ok(esha);
    assert.equal(esha.legalName, "Esha Bare");
    assert.equal(esha.gstin, null);
    assert.equal(pointed.o_bare, esha.id);

    const customers = (
        await c.query<{ organizationId: string; providerCustomerId: string }>(
            `SELECT "organizationId", "providerCustomerId" FROM "BillingCustomer" ORDER BY 1`,
        )
    ).rows;
    assert.equal(
        customers.length,
        3,
        "BillingCustomer rows stay for an operator",
    );
}

main().catch((error: unknown) => {
    fail(
        `The billing profiles migration's data move is wrong.\n${
            error instanceof Error ? error.message : String(error)
        }`,
    );
});
