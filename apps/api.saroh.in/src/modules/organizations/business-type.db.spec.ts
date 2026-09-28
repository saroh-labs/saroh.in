/**
 * A business's legal form against a real Postgres (F10): each of the six
 * saves and reads back, a private limited company is still stored as
 * `company` this release (release boundary 9, so a rollback reads it), and
 * the audit row says the change in today's words.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction, AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { BUSINESS_TYPES } from "./business-type";
import { OrganizationSettingsService } from "./organization-settings.service";

const settings = new OrganizationSettingsService(
    new AuditService(),
    {} as MediaService,
);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function business(type: string | null): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: {
            name: "Northwind Supply",
            slug: uniq("f10-org-"),
            ...(type ? { businessProfile: { create: { type } } } : {}),
        },
    });
    return { organizationId: org.id, userId: "user_owner", role: "OWNER" };
}

const storedType = async (ctx: OrganizationContext) =>
    (
        await prisma.businessProfile.findUnique({
            where: { organizationId: ctx.organizationId },
            select: { type: true },
        })
    )?.type ?? null;

const lastChanges = async (ctx: OrganizationContext) => {
    const row = await prisma.auditEvent.findFirst({
        where: {
            organizationId: ctx.organizationId,
            action: AuditAction.ProfileUpdate,
        },
        orderBy: { createdAt: "desc" },
        select: { metadata: true },
    });
    return (row?.metadata as { changes?: unknown } | null)?.changes;
};

describe("business types (real database, F10)", () => {
    it("saves LLP and records type: individual → llp", async () => {
        const ctx = await business("individual");

        const saved = await settings.update(ctx, { profile: { type: "llp" } });

        expect(saved.profile?.type).toBe("llp");
        expect(await storedType(ctx)).toBe("llp");
        expect(await lastChanges(ctx)).toEqual([
            { field: "type", before: "individual", after: "llp" },
        ]);
    });

    it("saves and reads back each of the six", async () => {
        const ctx = await business(null);
        for (const type of BUSINESS_TYPES) {
            await settings.update(ctx, { profile: { type } });
            const read = await settings.get(ctx);
            // Private limited is still kept in the old spelling.
            expect(read.profile?.type).toBe(type === "pvt" ? "company" : type);
        }
    });

    it("keeps an old client's company as company, and an existing company reads back as it was", async () => {
        const ctx = await business("company");
        expect((await settings.get(ctx)).profile?.type).toBe("company");

        await settings.update(ctx, { profile: { type: "individual" } });
        await settings.update(ctx, { profile: { type: "company" } });

        expect(await storedType(ctx)).toBe("company");
        expect(await lastChanges(ctx)).toEqual([
            { field: "type", before: "individual", after: "pvt" },
        ]);
    });

    it("clears the type to Not set", async () => {
        const ctx = await business("trust");

        await settings.update(ctx, { profile: { type: "" } });

        expect(await storedType(ctx)).toBeNull();
        expect(await lastChanges(ctx)).toEqual([
            { field: "type", before: "trust", after: null },
        ]);
    });
});
