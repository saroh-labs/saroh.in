/**
 * The Razorpay public key id (DEC-054, D22) against a real Postgres: setup
 * stores the key id as the public key; a connection made before that has
 * none, so the booking page offers no paying online and no provider order is
 * made; the backfill (packages/database/src/backfill/razorpay-public-keys.ts),
 * run with the API's own decrypt, fills it from the sealed key id — and a
 * second run writes nothing. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { backfillRazorpayPublicKeys, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { takesOnlinePayment } from "../bookings/public-booking-page";
import { decryptSecret, encryptSecret } from "./crypto";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const tag = `${process.pid}-${Date.now()}`;

async function business(name: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: `d22-${name.toLowerCase()}-${tag}` },
    });
    return { organizationId: org.id, userId: "user_1", role: "OWNER" };
}

/** A connection as setup wrote it before D22: the key id only sealed. */
async function oldConnection(
    ctx: OrganizationContext,
    over: {
        provider?: string;
        publicKey?: string | null;
        keyId?: string;
        status?: string;
        blob?: string;
    } = {},
) {
    const sealed = encryptSecret(
        over.blob ??
            JSON.stringify({
                keyId: over.keyId ?? "rzp_live_Old123",
                keySecret: "old-secret-value",
            }),
    );
    return prisma.merchantPaymentProvider.create({
        data: {
            organizationId: ctx.organizationId,
            provider: over.provider ?? "RAZORPAY",
            status: over.status ?? "CONNECTED",
            publicKey: over.publicKey ?? null,
            encryptedCredentials: sealed.ciphertext,
            credentialsIv: sealed.iv,
            credentialsAuthTag: sealed.authTag,
        },
    });
}

async function order(ctx: OrganizationContext) {
    const store = await prisma.store.create({
        data: {
            organizationId: ctx.organizationId,
            name: "Counter",
            slug: `d22-store-${ctx.organizationId}`,
        },
    });
    const customer = await prisma.customer.create({
        data: {
            storeId: store.id,
            organizationId: ctx.organizationId,
            email: `d22-buyer-${ctx.organizationId}@example.com`,
            firstName: "Asha",
        },
    });
    return prisma.order.create({
        data: {
            organizationId: ctx.organizationId,
            storeId: store.id,
            customerId: customer.id,
            orderId: `D22-${ctx.organizationId.slice(-6)}`,
            total: "500",
            subtotal: "500",
            currency: "INR",
        },
    });
}

const publicKeyOf = async (id: string) =>
    (
        await prisma.merchantPaymentProvider.findUniqueOrThrow({
            where: { id },
            select: { publicKey: true },
        })
    ).publicKey;

describe("Razorpay public key id (D22)", () => {
    it("setup stores the key id as the public key, and the booking page offers paying online", async () => {
        const ctx = await business("Setup");
        const view = await payments.connectProvider(ctx, {
            provider: "RAZORPAY",
            keyId: "rzp_test_Setup1",
            keySecret: "setup-secret",
        });
        expect(view.publicKey).toBe("rzp_test_Setup1");
        expect(await takesOnlinePayment(ctx.organizationId)).toBe(true);
    });

    it("an old connection without it takes no online payment until the backfill fills it", async () => {
        const ctx = await business("Old");
        const row = await oldConnection(ctx);
        const target = await order(ctx);

        expect(await takesOnlinePayment(ctx.organizationId)).toBe(false);
        const before = fake.calls.length;
        await expect(
            payments.createIntentForOrder(ctx, target.id),
        ).rejects.toThrow(/needs its public key id/);
        expect(fake.calls.length).toBe(before);

        const first = await backfillRazorpayPublicKeys(prisma, decryptSecret);
        expect(first.unreadable).not.toContain(row.id);
        expect(await publicKeyOf(row.id)).toBe("rzp_live_Old123");
        expect(await takesOnlinePayment(ctx.organizationId)).toBe(true);

        const intent = await payments.createIntentForOrder(ctx, target.id);
        expect(intent.publicKey).toBe("rzp_live_Old123");
        expect(JSON.stringify(intent)).not.toContain("old-secret-value");
    });

    it("corrects a different code typed into the old optional field, fills a disconnected one, and leaves Cashfree alone", async () => {
        const ctx = await business("Mixed");
        const typo = await oldConnection(ctx, { publicKey: "rzp_live_Typo" });
        // One connection per provider per business: the disconnected
        // Razorpay one belongs to a second business.
        const other = await business("Disconnected");
        const disabled = await oldConnection(other, {
            status: "DISABLED",
            keyId: "rzp_live_Off1",
        });
        const cashfree = await oldConnection(ctx, {
            provider: "CASHFREE",
            keyId: "CF_APP_1",
        });

        await backfillRazorpayPublicKeys(prisma, decryptSecret);
        expect(await publicKeyOf(typo.id)).toBe("rzp_live_Old123");
        expect(await publicKeyOf(disabled.id)).toBe("rzp_live_Off1");
        expect(await publicKeyOf(cashfree.id)).toBeNull();
    });

    it("leaves a connection whose key id can't be read, and names it", async () => {
        const ctx = await business("Broken");
        const broken = await oldConnection(ctx, {
            blob: JSON.stringify({ keySecret: "no-key-id" }),
        });
        const report = await backfillRazorpayPublicKeys(prisma, decryptSecret);
        expect(report.unreadable).toContain(broken.id);
        expect(await publicKeyOf(broken.id)).toBeNull();
        expect(JSON.stringify(report)).not.toContain("no-key-id");
    });

    it("is idempotent: a second run writes nothing", async () => {
        await backfillRazorpayPublicKeys(prisma, decryptSecret);
        const again = await backfillRazorpayPublicKeys(prisma, decryptSecret);
        expect(again.filled).toBe(0);
    });
});
