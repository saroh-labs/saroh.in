/**
 * The checklist's invoice count against a real Postgres (DEC-070 K4): once a
 * business has an invoice it invoices, so the address its invoices print is
 * asked for even with nothing on that takes money. `setup.invoices` counts
 * drafts and issued paper, never a void one, and only this business's.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { OrganizationSettingsService } from "./organization-settings.service";

const settings = new OrganizationSettingsService(
    new AuditService(),
    {} as MediaService,
);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function business(): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Asha Rao Studio", slug: uniq("k4-org-") },
    });
    return { organizationId: org.id, userId: "user_owner", role: "OWNER" };
}

async function invoice(ctx: OrganizationContext, status: string) {
    await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            status,
            number: status === "DRAFT" ? null : uniq("K4-"),
            currency: "INR",
            subtotal: "1000.00",
            total: "1000.00",
            ...(status === "DRAFT" ? {} : { issuedAt: new Date() }),
        },
    });
}

const invoicesOf = async (ctx: OrganizationContext) =>
    (await settings.get(ctx)).setup.invoices;

describe("setup.invoices (real database, DEC-070 K4)", () => {
    it("is 0 for a business that has never invoiced", async () => {
        expect(await invoicesOf(await business())).toBe(0);
    });

    it("counts drafts and issued invoices, not void ones", async () => {
        const ctx = await business();
        await invoice(ctx, "DRAFT");
        expect(await invoicesOf(ctx)).toBe(1);

        await invoice(ctx, "ISSUED");
        await invoice(ctx, "PAID");
        await invoice(ctx, "VOID");
        expect(await invoicesOf(ctx)).toBe(3);
    });

    it("counts only this business's invoices", async () => {
        const mine = await business();
        const theirs = await business();
        await invoice(theirs, "DRAFT");
        await invoice(theirs, "ISSUED");

        expect(await invoicesOf(mine)).toBe(0);
        expect(await invoicesOf(theirs)).toBe(2);
    });

    it("a business whose only invoice was voided is back to 0", async () => {
        const ctx = await business();
        await invoice(ctx, "VOID");
        expect(await invoicesOf(ctx)).toBe(0);
    });
});
