/**
 * The kind of place a business is (DEC-216) against a real Postgres:
 * setup stores the trade and the gallery's template, the list, the summary
 * and settings say it, the Owner changes it in settings (audited) while a
 * Member can't, and the column refuses a trade that isn't one.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction, AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { OnboardOrganizationDto, UpdateOrganizationDto } from "./dto";
import { OrganizationContextService } from "./organization-context.service";
import { OrganizationOnboardingService } from "./organization-onboarding.service";
import { OrganizationSettingsService } from "./organization-settings.service";

const audit = new AuditService();
const onboarding = new OrganizationOnboardingService(audit);
const settings = new OrganizationSettingsService(audit, {} as MediaService);
const context = new OrganizationContextService();

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function person(): Promise<string> {
    const user = await prisma.user.create({
        data: { email: `${uniq("trade-")}@saroh.test` },
        select: { id: true },
    });
    return user.id;
}

const as = (
    organizationId: string,
    userId: string,
    role: "OWNER" | "MEMBER" = "OWNER",
): OrganizationContext => ({ organizationId, userId, role });

/** The onboard DTO as the pipe makes it: transformed, then checked. */
async function onboardDto(body: Record<string, unknown>) {
    const dto = plainToInstance(OnboardOrganizationDto, body);
    return { dto, errors: await validate(dto) };
}

const MIGRATION = join(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20270202000000_organization_trade/migration.sql",
);

describe("Organization.trade (real database, DEC-216)", () => {
    it("stores the trade and the gallery's template at setup; the list, summary and settings say them", async () => {
        const userId = await person();
        const { dto, errors } = await onboardDto({
            name: "Meher Hair Studio",
            address: uniq("meher-"),
            trade: "salon",
            startTemplate: "salon",
        });
        expect(errors).toEqual([]);
        const org = await onboarding.onboard(userId, dto);

        const listed = (await context.listForUser(userId)).find(
            (o) => o.id === org.id,
        );
        expect(listed).toMatchObject({
            trade: "salon",
            startTemplate: "salon",
        });
        expect((await context.getSummary(org.id)).trade).toBe("salon");
        expect((await settings.get(as(org.id, userId))).trade).toBe("salon");
        const onboarded = await prisma.auditEvent.findFirst({
            where: {
                organizationId: org.id,
                action: AuditAction.OrganizationOnboard,
            },
            select: { metadata: true },
        });
        expect(onboarded?.metadata).toMatchObject({ trade: "salon" });
    });

    it("is none for an app that sends none, and drops a template Saroh doesn't know", async () => {
        const userId = await person();
        const { dto, errors } = await onboardDto({
            name: "Rye & Co",
            address: uniq("rye-"),
            startTemplate: "no-such-template",
        });
        expect(errors).toEqual([]);
        const org = await onboarding.onboard(userId, dto);
        const row = await prisma.organization.findUniqueOrThrow({
            where: { id: org.id },
            select: { trade: true, startTemplate: true },
        });
        expect(row).toEqual({ trade: null, startTemplate: null });
        expect((await context.getSummary(org.id)).trade).toBeNull();
    });

    it("refuses a trade that isn't one, at setup and in settings", async () => {
        const { errors } = await onboardDto({ name: "X", trade: "SALON" });
        expect(errors.map((e) => e.property)).toContain("trade");
        const update = plainToInstance(UpdateOrganizationDto, {
            trade: "spa",
        });
        expect((await validate(update)).map((e) => e.property)).toContain(
            "trade",
        );
        const clear = plainToInstance(UpdateOrganizationDto, { trade: null });
        expect(await validate(clear)).toEqual([]);
    });

    it("the Owner changes it in settings, audited; null clears it; a save without it leaves it", async () => {
        const userId = await person();
        const org = await onboarding.onboard(userId, {
            name: "Pulse Gym",
            address: uniq("pulse-"),
            trade: "gym",
        });
        const ctx = as(org.id, userId);

        expect((await settings.update(ctx, { trade: "clinic" })).trade).toBe(
            "clinic",
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
            fields: ["trade"],
            changes: [{ field: "trade", before: "gym", after: "clinic" }],
        });

        await settings.update(ctx, { name: "Pulse Clinic" });
        expect((await context.getSummary(org.id)).trade).toBe("clinic");

        expect((await settings.update(ctx, { trade: null })).trade).toBeNull();
    });

    it("a Member can't change it", async () => {
        const ownerId = await person();
        const org = await onboarding.onboard(ownerId, {
            name: "Asha's Salon",
            address: uniq("asha-"),
            trade: "salon",
        });
        const memberId = await person();
        await prisma.membership.create({
            data: { organizationId: org.id, userId: memberId, role: "MEMBER" },
        });
        await expect(
            settings.update(as(org.id, memberId, "MEMBER"), { trade: "gym" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect((await context.getSummary(org.id)).trade).toBe("salon");
    });

    describe("the trade typed beside Other (12 Nov 2026)", () => {
        it("is kept at setup with Other only, and said beside the trade", async () => {
            const userId = await person();
            const { dto, errors } = await onboardDto({
                name: "Crumb & Co",
                address: uniq("crumb-"),
                trade: "other",
                tradeOther: "  Bakery  ",
            });
            expect(errors).toEqual([]);
            const org = await onboarding.onboard(userId, dto);
            const listed = (await context.listForUser(userId)).find(
                (o) => o.id === org.id,
            );
            expect(listed).toMatchObject({
                trade: "other",
                tradeOther: "Bakery",
            });
            expect(await context.getSummary(org.id)).toMatchObject({
                trade: "other",
                tradeOther: "Bakery",
            });
            expect((await settings.get(as(org.id, userId))).tradeOther).toBe(
                "Bakery",
            );

            const salon = await onboarding.onboard(userId, {
                name: "Not a bakery",
                address: uniq("nab-"),
                trade: "salon",
                tradeOther: "Bakery",
            });
            const row = await prisma.organization.findUniqueOrThrow({
                where: { id: salon.id },
                select: { tradeOther: true },
            });
            expect(row.tradeOther).toBeNull();
        });

        it("must be 2 to 60 characters, trimmed", async () => {
            for (const tradeOther of ["B", " B ", "x".repeat(61)]) {
                const update = plainToInstance(UpdateOrganizationDto, {
                    trade: "other",
                    tradeOther,
                });
                expect(
                    (await validate(update)).map((e) => e.property),
                ).toContain("tradeOther");
            }
            const { errors } = await onboardDto({
                name: "X",
                address: uniq("x-"),
                trade: "other",
                tradeOther: "x".repeat(61),
            });
            expect(errors.map((e) => e.property)).toContain("tradeOther");
            const ok = plainToInstance(UpdateOrganizationDto, {
                trade: "other",
                tradeOther: "x".repeat(60),
            });
            expect(await validate(ok)).toEqual([]);
        });

        it("the Owner sets it, audited; changing the trade away clears it", async () => {
            const userId = await person();
            const org = await onboarding.onboard(userId, {
                name: "Stitch",
                address: uniq("stitch-"),
                trade: "shop",
            });
            const ctx = as(org.id, userId);

            const set = await settings.update(ctx, {
                trade: "other",
                tradeOther: "Tailor",
            });
            expect(set).toMatchObject({ trade: "other", tradeOther: "Tailor" });
            const audited = await prisma.auditEvent.findFirst({
                where: {
                    organizationId: org.id,
                    action: AuditAction.ProfileUpdate,
                },
                orderBy: { createdAt: "desc" },
                select: { metadata: true },
            });
            expect(audited?.metadata).toEqual({
                fields: ["trade", "tradeOther"],
                changes: [
                    { field: "trade", before: "shop", after: "other" },
                    { field: "tradeOther", before: null, after: "Tailor" },
                ],
            });

            // The typed trade alone, while the trade is Other.
            expect(
                (await settings.update(ctx, { tradeOther: "Tailoring" }))
                    .tradeOther,
            ).toBe("Tailoring");

            const away = await settings.update(ctx, { trade: "food" });
            expect(away).toMatchObject({ trade: "food", tradeOther: null });
            const row = await prisma.organization.findUniqueOrThrow({
                where: { id: org.id },
                select: { tradeOther: true },
            });
            expect(row.tradeOther).toBeNull();

            // Typed without Other: nothing kept.
            expect(
                (await settings.update(ctx, { tradeOther: "Tailor" }))
                    .tradeOther,
            ).toBeNull();
        });

        it("a Member can't set it", async () => {
            const ownerId = await person();
            const org = await onboarding.onboard(ownerId, {
                name: "Tuition Point",
                address: uniq("tuition-"),
                trade: "other",
                tradeOther: "Tuition",
            });
            const memberId = await person();
            await prisma.membership.create({
                data: {
                    organizationId: org.id,
                    userId: memberId,
                    role: "MEMBER",
                },
            });
            await expect(
                settings.update(as(org.id, memberId, "MEMBER"), {
                    tradeOther: "Coaching",
                }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect((await context.getSummary(org.id)).tradeOther).toBe(
                "Tuition",
            );
        });
    });

    it("refuses a trade that isn't one at the column (the migration's CHECK)", async () => {
        const [has] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM pg_constraint WHERE conname = 'Organization_trade_check'`,
        );
        if (!has || Number(has.n) === 0) {
            const check = readFileSync(MIGRATION, "utf8")
                .split(";")
                .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
                .find((s) => s.includes("Organization_trade_check"));
            if (!check) throw new Error("the migration has no CHECK");
            await prisma.$executeRawUnsafe(check);
        }
        await expect(
            prisma.$executeRawUnsafe(
                `INSERT INTO "Organization" ("id", "name", "slug", "trade") VALUES ($1, 'X', $2, 'spa')`,
                uniq("trade-x-"),
                uniq("trade-x-"),
            ),
        ).rejects.toThrow(/Organization_trade_check/);
    });
});
