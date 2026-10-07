/**
 * Review invitations against a real Postgres (MARKETING_CLAIMS D11, decided
 * 2026-10-07): they go only through the business's own email provider. With
 * none connected nothing is written; with one, the invitation is queued as
 * a Message + Delivery + `message.send` job to the order's customer, its
 * review link sealed in the job and never in the stored body, and the
 * ReviewInvitation is written in the same transaction. Runs in the
 * integration project (TEST_DATABASE_URL). Only the app env is stubbed
 * (the credential key that seals the link, and the renderer's address).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://renderer.test",
    },
    declaredNodeEnv: "test",
}));

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { MESSAGE_SEND_TYPE } from "../communications/message-send.handler";
import { SECRET_LINK_SLOT } from "../communications/transactional";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { decryptSecret } from "../payments/crypto";
import { ProductReviewsService } from "./product-reviews.service";
import { hashReviewToken } from "./token";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;

const reviews = () =>
    new ProductReviewsService(
        new CommunicationsService(),
        undefined,
        new FixedWindowRateLimiter(100, 60_000),
    );

/** A business with one shipped, paid order of one product. */
async function business(): Promise<{
    ctx: OrganizationContext;
    orderId: string;
}> {
    seq += 1;
    const user = await prisma.user.create({
        data: { email: `ri-owner-${seq}-${tag}@example.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `ri-org-${seq}-${tag}` },
    });
    const store = await prisma.store.create({
        data: {
            name: "High Street",
            slug: `ri-store-${seq}-${tag}`,
            organizationId: org.id,
        },
    });
    const customer = await prisma.customer.create({
        data: {
            organizationId: org.id,
            storeId: store.id,
            email: "ananya@example.in",
            firstName: "Ananya",
        },
    });
    const product = await prisma.product.create({
        data: {
            organizationId: org.id,
            name: "Sourdough",
            slug: `ri-sourdough-${seq}-${tag}`,
            price: "250.00",
            currency: "INR",
            status: "PUBLISHED",
        },
    });
    const order = await prisma.order.create({
        data: {
            storeId: store.id,
            organizationId: org.id,
            orderId: `RI-${tag}-${seq}`,
            customerId: customer.id,
            subtotal: "250",
            total: "250",
            currency: "INR",
            paymentStatus: "PAID",
            status: "DELIVERED",
            items: {
                create: [{ productId: product.id, quantity: 1, price: "250" }],
            },
        },
    });
    return {
        ctx: { organizationId: org.id, userId: user.id, role: "OWNER" },
        orderId: order.id,
    };
}

async function connectEmail(organizationId: string) {
    await prisma.communicationProvider.create({
        data: {
            organizationId,
            channel: "EMAIL",
            provider: "SMTP",
            fromAddress: "hello@rye.in",
            encryptedCredentials: "sealed",
            credentialsIv: "iv",
            credentialsAuthTag: "tag",
        },
    });
}

describe("Review invitations through the business's provider (D11, DB)", () => {
    it("with no email provider: skipped, and nothing is written", async () => {
        const b = await business();
        const service = reviews();
        expect(
            (await service.invitationState(b.ctx.organizationId, b.orderId))
                .blocked,
        ).toMatchObject({ reason: "no-email-provider" });

        const [result] = await service.invite(b.ctx, [b.orderId]);
        expect(result).toMatchObject({
            status: "skipped",
            reason: "no-email-provider",
        });
        expect(
            await prisma.message.count({
                where: { organizationId: b.ctx.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.reviewInvitation.count({
                where: { orderId: b.orderId },
            }),
        ).toBe(0);
    });

    it("with one: queued to the order's customer, the link sealed, the invitation written", async () => {
        const b = await business();
        await connectEmail(b.ctx.organizationId);

        const [result] = await reviews().invite(b.ctx, [b.orderId]);
        expect(result).toMatchObject({ status: "sent" });

        const message = await prisma.message.findFirstOrThrow({
            where: { organizationId: b.ctx.organizationId },
            include: { deliveries: true },
        });
        expect(message).toMatchObject({
            channel: "EMAIL",
            status: "QUEUED",
            toAddress: "ananya@example.in",
            template: "REVIEW_INVITATION",
            subject: "How was your order from High Street?",
        });
        expect(message.body).toContain(SECRET_LINK_SLOT);
        expect(message.body).not.toContain("/review/");
        expect(message.deliveries).toHaveLength(1);
        expect(message.deliveries[0]!.provider).toBe("SMTP");

        const job = await prisma.job.findFirstOrThrow({
            where: {
                organizationId: b.ctx.organizationId,
                type: MESSAGE_SEND_TYPE,
            },
        });
        const payload = job.payload as {
            messageId: string;
            link: Parameters<typeof decryptSecret>[0];
        };
        expect(payload.messageId).toBe(message.id);
        const link = decryptSecret(payload.link);
        expect(link.startsWith("https://renderer.test/review/")).toBe(true);
        const token = link.split("/review/")[1]!;

        const invitation = await prisma.reviewInvitation.findUniqueOrThrow({
            where: { orderId: b.orderId },
        });
        expect(invitation.tokenHash).toBe(hashReviewToken(token));
        expect(invitation.toAddress).toBe("ananya@example.in");
        expect(invitation.sendCount).toBe(1);
    });
});
