/**
 * "How to pay us" (R32) against a real Postgres: the six columns save
 * through the settings PATCH, read back apart from the profile, clear with
 * "", and the audit row names the change without its value. The public
 * read — the one every customer page uses — hands back only whole, valid
 * details, and nothing for a business that set none.
 *
 * The integration suite builds its schema with `prisma db push`, so the
 * migration's CHECK constraints are not here; `db:verify:replay` is what
 * looks at the migration file.
 *
 * Runs in the integration project (TEST_DATABASE_URL). Made-up details only.
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction, AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { businessPayInstructionsOf } from "./business-pay-instructions";
import { OrganizationSettingsService } from "./organization-settings.service";

const settings = new OrganizationSettingsService(
    new AuditService(),
    {} as MediaService,
);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

const UPI = "northwind.supply@okexample";
const ACCOUNT = "987654321012";
const IFSC_CODE = "WXYZ0654321";

async function business(): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Northwind Supply", slug: uniq("r32-org-") },
    });
    return { organizationId: org.id, userId: "user_owner", role: "OWNER" };
}

const lastAudit = async (ctx: OrganizationContext) =>
    (
        await prisma.auditEvent.findFirst({
            where: {
                organizationId: ctx.organizationId,
                action: AuditAction.ProfileUpdate,
            },
            orderBy: { createdAt: "desc" },
            select: { metadata: true },
        })
    )?.metadata as { fields?: string[]; changes?: unknown[] } | null;

describe("how to pay us (real database, R32)", () => {
    it("saves all six, reads them back, and audits names only", async () => {
        const ctx = await business();

        const saved = await settings.update(ctx, {
            payInstructions: {
                upiId: ` ${UPI.toUpperCase()} `,
                bankAccountName: "Northwind Supply",
                bankAccountNumber: "9876 5432 1012",
                bankIfsc: "wxyz0654321",
                bankName: "Example Bank",
                note: "Send a screenshot once paid.",
            },
        });

        const expected = {
            upiId: UPI,
            bankAccountName: "Northwind Supply",
            bankAccountNumber: ACCOUNT,
            bankIfsc: IFSC_CODE,
            bankName: "Example Bank",
            note: "Send a screenshot once paid.",
        };
        expect(saved.payInstructions).toEqual(expected);
        expect((await settings.get(ctx)).payInstructions).toEqual(expected);

        const audit = await lastAudit(ctx);
        expect(audit?.fields?.sort()).toEqual(
            [
                "payBankAccountName",
                "payBankAccountNumber",
                "payBankIfsc",
                "payBankName",
                "payNote",
                "payUpiId",
            ].sort(),
        );
        expect(audit?.changes).toEqual([]);
        expect(JSON.stringify(audit)).not.toContain(ACCOUNT);
        expect(JSON.stringify(audit)).not.toContain("okexample");

        expect(await businessPayInstructionsOf(ctx.organizationId)).toEqual(
            expected,
        );
    });

    it("clears with an empty string, and the public read then has nothing", async () => {
        const ctx = await business();
        await settings.update(ctx, { payInstructions: { upiId: UPI } });
        expect(
            (await businessPayInstructionsOf(ctx.organizationId))?.upiId,
        ).toBe(UPI);

        await settings.update(ctx, { payInstructions: { upiId: "" } });

        expect((await settings.get(ctx)).payInstructions.upiId).toBeNull();
        expect(await businessPayInstructionsOf(ctx.organizationId)).toBeNull();
    });

    it("refuses half the bank details and keeps what was saved", async () => {
        const ctx = await business();
        await settings.update(ctx, {
            payInstructions: {
                bankAccountName: "Northwind Supply",
                bankAccountNumber: ACCOUNT,
                bankIfsc: IFSC_CODE,
            },
        });

        await expect(
            settings.update(ctx, { payInstructions: { bankIfsc: "" } }),
        ).rejects.toThrow("IFSC");

        const row = await prisma.businessProfile.findUnique({
            where: { organizationId: ctx.organizationId },
            select: { payBankIfsc: true },
        });
        expect(row?.payBankIfsc).toBe(IFSC_CODE);
    });

    it("a business with no profile has none, and another business's never leak", async () => {
        const none = await business();
        const other = await business();
        await settings.update(other, { payInstructions: { upiId: UPI } });

        expect(await businessPayInstructionsOf(none.organizationId)).toBeNull();
        expect((await settings.get(none)).payInstructions.upiId).toBeNull();
    });
});
