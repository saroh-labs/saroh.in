/**
 * Who referred a business (DEC-156) against a real Postgres: setup records
 * the business whose code was carried and the moment, and the relation
 * reads both ways; an unknown code, a waitlist entry's id and someone
 * already in the referring business record nobody; a waitlist entry keeps
 * the referring business until its owner signs up; and the column refuses a
 * business that names itself.
 *
 * The integration schema is built by `prisma db push`, which carries no
 * CHECK. The CHECK test adds the migration's own constraint when the
 * database lacks it, so it proves the migration's SQL, not a copy.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@saroh/database";

import { AuditService } from "../audit/audit.service";
import { newRefCode } from "../waitlist/waitlist-keys";
import { WaitlistService } from "../waitlist/waitlist.service";
import { OrganizationOnboardingService } from "./organization-onboarding.service";

const onboarding = new OrganizationOnboardingService(new AuditService());
const waitlist = new WaitlistService();

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function person(
    input: { email?: string; emailVerified?: boolean } = {},
): Promise<string> {
    const user = await prisma.user.create({
        data: {
            email: input.email ?? `${uniq("ref-")}@example.com`,
            emailVerified: input.emailVerified ?? true,
        },
        select: { id: true },
    });
    return user.id;
}

/** A business with a referral code, and the person who owns it. */
async function referrer(): Promise<{
    id: string;
    code: string;
    ownerId: string;
}> {
    const ownerId = await person();
    const org = await onboarding.onboard(ownerId, {
        name: "Rye and Co",
        address: uniq("rye-"),
    });
    const code = newRefCode();
    await prisma.organization.update({
        where: { id: org.id },
        data: { referralCode: code },
    });
    return { id: org.id, code, ownerId };
}

const referral = (id: string) =>
    prisma.organization.findUniqueOrThrow({
        where: { id },
        select: {
            referredByOrganizationId: true,
            referredAt: true,
            referredByOrganization: { select: { id: true, name: true } },
        },
    });

const MIGRATION = join(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20261122100000_organization_referred_by/migration.sql",
);

describe("who referred a business (real database, DEC-156)", () => {
    it("records the business whose code was carried, and when", async () => {
        const rye = await referrer();
        const before = Date.now();

        const made = await onboarding.onboard(await person(), {
            name: "Pulse Studio",
            address: uniq("pulse-"),
            referralCode: rye.code,
        });

        const stored = await referral(made.id);
        expect(stored.referredByOrganization).toEqual({
            id: rye.id,
            name: "Rye and Co",
        });
        expect(stored.referredAt?.getTime()).toBeGreaterThanOrEqual(before);

        // The other side of the relation, which only an operator's read uses.
        const referred = await prisma.organization.findMany({
            where: { referredByOrganizationId: rye.id },
            select: { id: true },
        });
        expect(referred).toEqual([{ id: made.id }]);

        // One level: the referrer was referred by nobody, and stays so.
        expect((await referral(rye.id)).referredByOrganizationId).toBeNull();
    });

    it("records nobody for a code no business has, and still makes the business", async () => {
        const made = await onboarding.onboard(await person(), {
            name: "Pulse Studio",
            address: uniq("pulse-"),
            referralCode: newRefCode(),
        });

        const stored = await referral(made.id);
        expect(stored.referredByOrganizationId).toBeNull();
        expect(stored.referredAt).toBeNull();
    });

    it("records nobody when the referring business has been deleted", async () => {
        const rye = await referrer();
        await prisma.organization.update({
            where: { id: rye.id },
            data: {
                lifecycleStatus: "DELETED_RETAINED",
                deletedRetainedAt: new Date(),
            },
        });

        const made = await onboarding.onboard(await person(), {
            name: "Pulse Studio",
            address: uniq("pulse-"),
            referralCode: rye.code,
        });

        expect((await referral(made.id)).referredByOrganizationId).toBeNull();
    });

    it("records nobody for someone already in the referring business", async () => {
        const rye = await referrer();
        const teammate = await person();
        await prisma.membership.create({
            data: {
                organizationId: rye.id,
                userId: teammate,
                role: "MEMBER",
            },
        });

        for (const userId of [rye.ownerId, teammate]) {
            // Rye's owner has a billing profile already, so chooses it
            // (DEC-167); the teammate has none and gets their first.
            const mine = await prisma.billingProfile.findFirst({
                where: { ownerUserId: userId },
                select: { id: true },
            });
            const made = await onboarding.onboard(userId, {
                name: "Rye Second Shop",
                address: uniq("rye-two-"),
                referralCode: rye.code,
                ...(mine ? { billingProfileId: mine.id } : {}),
            });
            expect(
                (await referral(made.id)).referredByOrganizationId,
            ).toBeNull();
        }
    });

    it("never takes a waitlist entry's id for a business's code", async () => {
        const entrant = await waitlist.join({
            email: `${uniq("wl-")}@example.com`,
            business: "Glow Studio",
            kind: "salon",
        });
        if (!entrant.created || !entrant.refCode) {
            throw new Error("expected a new entry with a referral id");
        }

        const made = await onboarding.onboard(await person(), {
            name: "Pulse Studio",
            address: uniq("pulse-"),
            referralCode: entrant.refCode,
        });
        expect((await referral(made.id)).referredByOrganizationId).toBeNull();

        // Even where a business has drawn the same eight characters.
        const rye = await referrer();
        await prisma.organization.update({
            where: { id: rye.id },
            data: { referralCode: entrant.refCode },
        });
        const second = await onboarding.onboard(await person(), {
            name: "Pulse Two",
            address: uniq("pulse-"),
            referralCode: entrant.refCode,
        });
        expect((await referral(second.id)).referredByOrganizationId).toBeNull();
    });

    it("keeps the referring business on a waitlist entry, and records it when its owner signs up", async () => {
        const rye = await referrer();
        const email = `${uniq("wl-")}@example.com`;

        const entry = await waitlist.join({
            email,
            business: "Pulse Studio",
            kind: "gym",
            ref: rye.code,
        });
        expect(entry.created).toBe(true);
        const kept = await prisma.waitlistSignup.findFirstOrThrow({
            where: { email },
            select: { referredById: true, referredByOrganizationId: true },
        });
        expect(kept).toEqual({
            referredById: null,
            referredByOrganizationId: rye.id,
        });

        // No code in the browser this time: the entry's is used.
        const made = await onboarding.onboard(await person({ email }), {
            name: "Pulse Studio",
            address: uniq("pulse-"),
        });
        expect((await referral(made.id)).referredByOrganizationId).toBe(rye.id);
    });

    it("does not read a waitlist entry for an account whose email isn't confirmed", async () => {
        const rye = await referrer();
        const email = `${uniq("wl-")}@example.com`;
        await waitlist.join({
            email,
            business: "Pulse Studio",
            kind: "gym",
            ref: rye.code,
        });

        const made = await onboarding.onboard(
            await person({ email, emailVerified: false }),
            { name: "Pulse Studio", address: uniq("pulse-") },
        );

        expect((await referral(made.id)).referredByOrganizationId).toBeNull();
    });

    it("refuses a business that names itself at the column (the migration's CHECK)", async () => {
        const [has] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM pg_constraint WHERE conname = 'Organization_not_self_referred'`,
        );
        if (!has || Number(has.n) === 0) {
            const check = readFileSync(MIGRATION, "utf8")
                .split(";")
                .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
                .find((s) => s.includes("Organization_not_self_referred"));
            if (!check) throw new Error("the migration has no CHECK");
            await prisma.$executeRawUnsafe(check);
        }

        const rye = await referrer();
        await expect(
            prisma.$executeRawUnsafe(
                `UPDATE "Organization" SET "referredByOrganizationId" = "id" WHERE "id" = $1`,
                rye.id,
            ),
        ).rejects.toThrow(/Organization_not_self_referred/);
    });
});
