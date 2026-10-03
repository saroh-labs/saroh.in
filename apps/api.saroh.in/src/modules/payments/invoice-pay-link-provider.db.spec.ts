/**
 * An invoice's pay link follows the provider rule (B11, D22) against a real
 * Postgres: a Razorpay connection still missing its public key id can't open
 * the checkout window, so no link is minted for it — the 409 says what it
 * needs — and when the business also has a connection that can, the link is
 * minted and its page starts the payment through that one, never the
 * Razorpay connection that would refuse. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "../invoices/invoices.service";
import { encryptSecret } from "./crypto";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";
import { PublicInvoicesService } from "./public-invoices.service";

const fake = new FakeMerchantProvider("CASHFREE");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const publicInvoices = new PublicInvoicesService(payments);
const invoices = new InvoicesService();
const tag = `${process.pid}-${Date.now()}`;

async function business(name: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: `inv-link-${name.toLowerCase()}-${tag}` },
    });
    await giveBusinessDetails(org.id);
    return { organizationId: org.id, userId: "user_1", role: "OWNER" };
}

async function connection(
    ctx: OrganizationContext,
    provider: "RAZORPAY" | "CASHFREE",
    publicKey: string | null,
    createdAt: Date,
) {
    const sealed = encryptSecret(
        JSON.stringify({ keyId: "key_id", keySecret: "secret-value" }),
    );
    await prisma.merchantPaymentProvider.create({
        data: {
            organizationId: ctx.organizationId,
            provider,
            status: "CONNECTED",
            publicKey,
            encryptedCredentials: sealed.ciphertext,
            credentialsIv: sealed.iv,
            credentialsAuthTag: sealed.authTag,
            createdAt,
        },
    });
}

async function issued(ctx: OrganizationContext): Promise<string> {
    const contact = await prisma.contact.create({
        data: {
            organizationId: ctx.organizationId,
            email: `asha-${ctx.organizationId}@example.com`,
            firstName: "Asha",
        },
    });
    const draft = await invoices.createDraft(ctx, {
        contactId: contact.id,
        currency: "INR",
        lines: [{ description: "Membership", quantity: 1, unitPrice: "1200" }],
    });
    await invoices.issue(ctx, draft.id);
    return draft.id;
}

describe("an invoice's pay link and the provider rule (B11, D22)", () => {
    it("mints none for a Razorpay connection missing its public key id, and says what it needs", async () => {
        const ctx = await business("NoKey");
        await connection(ctx, "RAZORPAY", null, new Date("2026-01-01"));
        const id = await issued(ctx);

        const refused = invoices.createPayLink(ctx, id);
        await expect(refused).rejects.toBeInstanceOf(ConflictException);
        await expect(refused).rejects.toThrow(
            "Your Razorpay connection needs its public key id before it can take a pay link. Add it in Settings › Providers.",
        );
        const stored = await prisma.invoice.findUniqueOrThrow({
            where: { id },
            select: { payTokenHash: true },
        });
        expect(stored.payTokenHash).toBeNull();
    });

    it("mints through a connection that can open the window, and the page pays through that one", async () => {
        const ctx = await business("Both");
        // The older connection can't open the window; the newer one can.
        await connection(ctx, "RAZORPAY", null, new Date("2026-01-01"));
        await connection(ctx, "CASHFREE", null, new Date("2026-02-01"));
        const id = await issued(ctx);

        const { token } = await invoices.createPayLink(ctx, id);
        const started = await publicInvoices.createIntent(token, {
            idempotencyKey: `k-${tag}`,
        });

        expect(started.provider).toBe("CASHFREE");
        expect(
            await prisma.paymentIntent.findFirstOrThrow({
                where: { invoiceId: id },
                select: { provider: true, amountCents: true },
            }),
        ).toEqual({ provider: "CASHFREE", amountCents: 120_000 });
    });

    it("mints none when nothing is connected", async () => {
        const ctx = await business("Nothing");
        const id = await issued(ctx);

        await expect(invoices.createPayLink(ctx, id)).rejects.toThrow(
            "Connect a payment provider to send a pay link.",
        );
    });
});
