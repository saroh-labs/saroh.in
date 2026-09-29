/**
 * A payment connection needs its webhook signing secret (DEC-063), against
 * a real Postgres. Found in a live test: Razorpay connected without one,
 * every webhook refused, a customer's ₹500 booking left "Awaiting payment".
 *
 * - The connect body without it is a 400 with words a merchant can act on
 *   (the global ValidationPipe, as `main.ts` builds it).
 * - With it, the secret is sealed, never on the row in plain text, and a
 *   webhook Razorpay signs with it verifies.
 * - A connection saved before this rule is flagged in the providers list,
 *   and Payments reads "needs attention", not ready.
 * - The webhook setup read is the business's own: its address, and when
 *   one of ITS payment updates last arrived.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        // The webhook address is built from it (d3e78c8f), never guessed.
        API_PUBLIC_URL: "https://api.example.test",
        NODE_ENV: "test",
    },
}));

import { createHmac } from "node:crypto";

import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { RazorpayWebhookProvider } from "../webhooks/providers/razorpay.webhook";
import { encryptSecret } from "./crypto";
import { ConnectProviderDto } from "./dto";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";
import { WEBHOOK_SECRET_REQUIRED } from "./webhook-secret";

const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const tag = `${process.pid}-${Date.now()}`;

async function business(name: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: `whsecret-${name.toLowerCase()}-${tag}` },
    });
    await giveBusinessDetails(org.id);
    return { organizationId: org.id, userId: "user_1", role: "OWNER" };
}

const pipe = new ValidationPipe(validationPipeOptions);
const body = (value: unknown) =>
    pipe.transform(value, { type: "body", metatype: ConnectProviderDto });

describe("connect needs the webhook signing secret (DEC-063)", () => {
    it("refuses a Razorpay connect without it — 400, the merchant's words", async () => {
        const refused = await body({
            provider: "RAZORPAY",
            keyId: "rzp_test_AbC123",
            keySecret: "super-secret-value",
        }).catch((e: unknown) => e);

        expect(refused).toBeInstanceOf(BadRequestException);
        expect(
            JSON.stringify((refused as BadRequestException).getResponse()),
        ).toContain(WEBHOOK_SECRET_REQUIRED);
    });

    it("seals it, and a webhook Razorpay signs with it verifies", async () => {
        const ctx = await business("Sealed");
        const dto = (await body({
            provider: "razorpay",
            keyId: "rzp_test_AbC123",
            keySecret: "super-secret-value",
            webhookSecret: "  whsec_chosen_in_razorpay  ",
        })) as ConnectProviderDto;

        const connected = await payments.connectProvider(ctx, dto);
        expect(connected.webhookSecretMissing).toBe(false);

        const row = await prisma.merchantPaymentProvider.findUniqueOrThrow({
            where: {
                organizationId_provider: {
                    organizationId: ctx.organizationId,
                    provider: "RAZORPAY",
                },
            },
        });
        expect(JSON.stringify(row)).not.toContain("whsec_chosen_in_razorpay");

        const secret = await payments.getWebhookSecret(
            ctx.organizationId,
            "RAZORPAY",
        );
        expect(secret).toBe("whsec_chosen_in_razorpay");
        const raw = Buffer.from(JSON.stringify({ event: "payment.captured" }));
        const signature = createHmac("sha256", "whsec_chosen_in_razorpay")
            .update(raw)
            .digest("hex");
        expect(
            new RazorpayWebhookProvider().verifySignature({
                rawBody: raw,
                headers: { "x-razorpay-signature": signature },
                secret: secret!,
            }),
        ).toBe(true);
    });
});

describe("a connection saved without it", () => {
    async function legacy(ctx: OrganizationContext) {
        const sealed = encryptSecret(
            JSON.stringify({
                keyId: "rzp_live_Old123",
                keySecret: "old-secret-value",
            }),
        );
        await prisma.merchantPaymentProvider.create({
            data: {
                organizationId: ctx.organizationId,
                provider: "RAZORPAY",
                status: "CONNECTED",
                publicKey: "rzp_live_Old123",
                encryptedCredentials: sealed.ciphertext,
                credentialsIv: sealed.iv,
                credentialsAuthTag: sealed.authTag,
            },
        });
    }

    it("is flagged in the list, and Payments needs attention", async () => {
        const ctx = await business("Legacy");
        await legacy(ctx);

        const [row] = await payments.listProviders(ctx);
        expect(row.webhookSecretMissing).toBe(true);
        expect(JSON.stringify(row)).not.toContain("old-secret-value");

        const readiness = await new ModuleReadinessRegistry().evaluate(
            "PAYMENTS",
            { organizationId: ctx.organizationId },
        );
        expect(readiness.readiness).toBe("ATTENTION_REQUIRED");
        expect(readiness.blockers[0]?.code).toBe(
            "PAYMENTS_WEBHOOK_SECRET_MISSING",
        );
    });

    it("is fixed by entering the keys again with the secret", async () => {
        const ctx = await business("Fixed");
        await legacy(ctx);

        await payments.connectProvider(ctx, {
            provider: "RAZORPAY",
            keyId: "rzp_live_Old123",
            keySecret: "old-secret-value",
            webhookSecret: "whsec_new",
        });

        const [row] = await payments.listProviders(ctx);
        expect(row.webhookSecretMissing).toBe(false);
        const readiness = await new ModuleReadinessRegistry().evaluate(
            "PAYMENTS",
            { organizationId: ctx.organizationId },
        );
        expect(readiness.readiness).toBe("ACTIVE");
    });
});

describe("the webhook setup read", () => {
    it("is the business's own address and its own last update", async () => {
        const mine = await business("Mine");
        const theirs = await business("Theirs");
        const at = new Date("2026-09-29T09:00:00Z");
        await prisma.webhookEvent.create({
            data: {
                organizationId: theirs.organizationId,
                provider: "RAZORPAY",
                providerEventId: `evt-theirs-${tag}`,
                eventType: "payment.captured",
                payload: {},
                status: "PROCESSED",
                createdAt: new Date("2026-09-29T11:00:00Z"),
            },
        });
        await prisma.webhookEvent.create({
            data: {
                organizationId: mine.organizationId,
                provider: "RAZORPAY",
                providerEventId: `evt-mine-${tag}`,
                eventType: "payment.captured",
                payload: {},
                status: "PROCESSED",
                createdAt: at,
            },
        });

        const setup = await payments.webhookSetup(mine);
        const razorpay = setup.find((s) => s.provider === "RAZORPAY")!;
        const cashfree = setup.find((s) => s.provider === "CASHFREE")!;

        expect(razorpay.url).toMatch(
            new RegExp(`/public/webhooks/razorpay/${mine.organizationId}$`),
        );
        expect(razorpay.lastReceivedAt).toEqual(at);
        expect(razorpay.secretRequired).toBe(true);
        expect(cashfree.lastReceivedAt).toBeNull();
        expect(cashfree.secretRequired).toBe(false);
    });
});
