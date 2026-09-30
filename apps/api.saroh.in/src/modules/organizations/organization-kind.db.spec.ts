/**
 * What is being set up (DEC-070, K1) against a real Postgres: onboarding
 * stores the kind chosen (a business when none is sent), the summary, the
 * list and settings all say it, a settings save changes it or leaves it,
 * and the column refuses a kind that isn't one.
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

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction, AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { OrganizationContextService } from "./organization-context.service";
import { organizationKind } from "./organization-kind";
import { OrganizationOnboardingService } from "./organization-onboarding.service";
import { OrganizationSettingsService } from "./organization-settings.service";

const audit = new AuditService();
const onboarding = new OrganizationOnboardingService(audit);
const settings = new OrganizationSettingsService(audit, {} as MediaService);
const context = new OrganizationContextService();

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function person(): Promise<string> {
    const email = `${uniq("kind-")}@saroh.test`;
    const user = await prisma.user.create({
        data: { email },
        select: { id: true },
    });
    return user.id;
}

const owner = (
    organizationId: string,
    userId: string,
): OrganizationContext => ({
    organizationId,
    userId,
    role: "OWNER",
});

const MIGRATION = join(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20261020120000_organization_kind/migration.sql",
);

describe("Organization.kind (real database, DEC-070)", () => {
    it("stores SOLO at setup, and the summary, the list and settings all say it", async () => {
        const userId = await person();
        const org = await onboarding.onboard(userId, {
            name: "Asha Rao",
            address: uniq("asha-"),
            kind: "SOLO",
        });

        expect((await context.getSummary(org.id)).kind).toBe("SOLO");
        const listed = await context.listForUser(userId);
        expect(listed.find((o) => o.id === org.id)?.kind).toBe("SOLO");
        expect((await settings.get(owner(org.id, userId))).kind).toBe("SOLO");
        expect(await organizationKind(prisma, org.id)).toBe("SOLO");

        const onboarded = await prisma.auditEvent.findFirst({
            where: {
                organizationId: org.id,
                action: AuditAction.OrganizationOnboard,
            },
            select: { metadata: true },
        });
        expect(onboarded?.metadata).toMatchObject({ kind: "SOLO" });
    });

    it("stores a business when an older app sends no kind", async () => {
        const userId = await person();
        const org = await onboarding.onboard(userId, {
            name: "Rye & Co",
            address: uniq("rye-"),
        });
        expect(await organizationKind(prisma, org.id)).toBe("BUSINESS");
    });

    it("changes it in settings, audited, and a save without it leaves it", async () => {
        const userId = await person();
        const org = await onboarding.onboard(userId, {
            name: "Asha Rao Studio",
            address: uniq("studio-"),
        });
        const ctx = owner(org.id, userId);

        expect((await settings.update(ctx, { kind: "WORK" })).kind).toBe(
            "WORK",
        );
        const changed = await prisma.auditEvent.findFirst({
            where: {
                organizationId: org.id,
                action: AuditAction.ProfileUpdate,
            },
            orderBy: { createdAt: "desc" },
            select: { metadata: true },
        });
        expect(changed?.metadata).toEqual({
            fields: ["kind"],
            changes: [{ field: "kind", before: "BUSINESS", after: "WORK" }],
        });

        await settings.update(ctx, { name: "Asha Rao Works" });
        expect(await organizationKind(prisma, org.id)).toBe("WORK");
    });

    it("refuses a kind that isn't one at the column (the migration's CHECK)", async () => {
        const [has] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM pg_constraint WHERE conname = 'Organization_kind_check'`,
        );
        if (!has || Number(has.n) === 0) {
            const check = readFileSync(MIGRATION, "utf8")
                .split(";")
                .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
                .find((s) => s.includes("Organization_kind_check"));
            if (!check) throw new Error("the migration has no CHECK");
            await prisma.$executeRawUnsafe(check);
        }

        await expect(
            prisma.$executeRawUnsafe(
                `INSERT INTO "Organization" ("id", "name", "slug", "kind") VALUES ($1, 'X', $2, 'X')`,
                uniq("kind-x-"),
                uniq("kind-x-"),
            ),
        ).rejects.toThrow(/Organization_kind_check/);

        const ok = uniq("kind-ok-");
        await prisma.$executeRawUnsafe(
            `INSERT INTO "Organization" ("id", "name", "slug") VALUES ($1, 'Plain', $1)`,
            ok,
        );
        expect(await organizationKind(prisma, ok)).toBe("BUSINESS");
    });
});
