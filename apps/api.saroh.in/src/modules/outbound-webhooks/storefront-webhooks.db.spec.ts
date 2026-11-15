/**
 * A storefront booking queues its webhooks (plan 2026-11-10-001, U13; the
 * integration moved from U7): booked over HTTP with a storefront token, as
 * a business's own site does, through the one place bookings are made.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/auth", () => ({
    isTrustedOrigin: (origin: string): boolean => {
        try {
            return new URL(origin).origin.endsWith(".saroh.in");
        } catch {
            return false;
        }
    },
}));

import { prisma } from "@saroh/database";

import {
    bearer,
    booking,
    business,
    call,
    mint,
    nextMonday,
    SITE,
    useStorefrontApp,
} from "../../../test/fixtures/storefront";
import { WEBHOOK_DELIVER_TYPE } from "./emitter";

useStorefrontApp();

describe("storefront booking → webhooks (U13)", () => {
    it("queues booking.created and customer.created for a subscribed endpoint", async () => {
        const org = await business("Pulse Fitness");
        // Only what the emit reads: the sealed secret is never opened here.
        await prisma.webhookEndpoint.create({
            data: {
                organizationId: org.id,
                createdByUserId: org.owner,
                url: "https://hooks.example.com/saroh",
                events: ["booking.created", "customer.created"],
                secretCiphertext: "x",
                secretIv: "x",
                secretAuthTag: "x",
            },
        });
        const { token } = await mint(org);
        const booked = await call(
            "POST",
            "/v1/storefront/write/bookings",
            { ...bearer(token), origin: SITE },
            booking(org.serviceId, nextMonday(6)),
        );
        expect(booked.status).toBe(201);

        const row = await prisma.booking.findFirstOrThrow({
            where: { organizationId: org.id },
        });
        const deliveries = await prisma.webhookDelivery.findMany({
            where: { organizationId: org.id },
            orderBy: { event: "asc" },
        });
        expect(deliveries.map((d) => [d.event, d.payload])).toEqual([
            ["booking.created", { ref: row.id }],
            ["customer.created", { ref: row.contactId }],
        ]);
        expect(
            await prisma.job.count({
                where: { organizationId: org.id, type: WEBHOOK_DELIVER_TYPE },
            }),
        ).toBe(2);
    });
});
