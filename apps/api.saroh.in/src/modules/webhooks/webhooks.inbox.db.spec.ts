/**
 * The webhook inbox is idempotent per business (PAY-05, #106), against a
 * real Postgres. It was unique on (provider, providerEventId) across every
 * business, so a business that signs bodies to its own endpoint could claim
 * the id of another's next delivery first, and the real one was answered
 * "duplicate" and never reconciled. Now the same id under two businesses is
 * two deliveries, and a repeat within one business is still a duplicate.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "./providers/fake.webhook";
import { WebhooksService } from "./webhooks.service";

const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const tag = `${process.pid}-${Date.now()}`;

async function business(
    name: string,
    webhookSecret: string,
): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: `inbox-${name.toLowerCase()}-${tag}` },
    });
    await giveBusinessDetails(org.id);
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: "user_1",
        role: "OWNER",
    };
    await payments.connectProvider(ctx, {
        provider: "RAZORPAY",
        publicKey: `rzp_test_${name}`,
        keyId: `rzp_test_${name}`,
        keySecret: `${name}_key_secret`,
        webhookSecret,
    });
    return ctx;
}

function deliver(
    ctx: OrganizationContext,
    secret: string,
    providerEventId: string,
) {
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId,
            eventType: "payment.captured",
            outcome: "IGNORED",
        }),
    );
    return webhooks.handle("razorpay", ctx.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", secret)
            .update(raw)
            .digest("hex"),
    });
}

describe("the webhook inbox is unique per business (PAY-05)", () => {
    it("the same event id under two businesses is two deliveries; a repeat in one is a duplicate", async () => {
        const a = await business("Alpha", "whsec_alpha");
        const b = await business("Bravo", "whsec_bravo");
        const id = `evt_shared_${tag}`;

        // B claims the id first, signing it to its own endpoint.
        await expect(deliver(b, "whsec_bravo", id)).resolves.toEqual({
            status: "ignored",
            changed: false,
        });
        // A's real delivery is still accepted and recorded as A's.
        await expect(deliver(a, "whsec_alpha", id)).resolves.toEqual({
            status: "ignored",
            changed: false,
        });
        // A repeat within one business is still the exactly-once no-op.
        await expect(deliver(a, "whsec_alpha", id)).resolves.toEqual({
            status: "duplicate",
            changed: false,
        });

        const rows = await prisma.webhookEvent.findMany({
            where: { providerEventId: id },
            select: { organizationId: true },
        });
        expect(rows.map((r) => r.organizationId).sort()).toEqual(
            [a.organizationId, b.organizationId].sort(),
        );
    });
});
