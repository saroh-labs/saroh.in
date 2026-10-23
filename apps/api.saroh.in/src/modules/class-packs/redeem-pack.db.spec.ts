/**
 * "You have 1 class left" (DEC-174 U22, #1153) against a real Postgres: a
 * spend that leaves one credit queues PACK_LOW on the booking's own
 * transaction, and the customer is emailed once through the business's
 * own provider. A class given back and the same booking paid again says
 * nothing twice; a new booking that brings it down to one again does. A
 * class given back before the job runs tells nobody. With Pack credits
 * off nothing is queued.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`. Only the
 * app env is stubbed (the credential key).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { prisma } from "@saroh/database";

import {
    classBooking,
    customerNotify,
    emailsOf,
    holding,
    makePack,
    packStudio,
    pendingNotices,
    runNotices,
} from "../../../test/fixtures/packs";
import { InvoicesService } from "../invoices/invoices.service";
import { packLowNoticeKey } from "../site-accounts/notices/pack";
import { ClassPacksService } from "./class-packs.service";

const packs = new ClassPacksService(new InvoicesService());
const DAY = 86_400_000;

afterAll(async () => {
    await prisma.$disconnect();
});

async function threeClassPack() {
    const s = await packStudio();
    const pack = await makePack(s, 3);
    const purchaseId = await holding(s, pack.id, {
        credits: 3,
        expiresAt: new Date(Date.now() + 60 * DAY),
    });
    return { s, purchaseId };
}

describe("one credit left", () => {
    it("is queued only when a spend leaves one, and emailed once", async () => {
        const { s, purchaseId } = await threeClassPack();
        const first = await classBooking(s, 2);
        await packs.useOnBooking(s.owner, first, {
            packPurchaseId: purchaseId,
        });
        expect(await pendingNotices(s.organizationId, "PACK_LOW")).toHaveLength(
            0,
        );

        const second = await classBooking(s, 3);
        await packs.useOnBooking(s.owner, second, {
            packPurchaseId: purchaseId,
        });
        const queued = await pendingNotices(s.organizationId, "PACK_LOW");
        expect(queued).toHaveLength(1);
        expect(queued[0]!.payload).toMatchObject({
            kind: "PACK_LOW",
            eventKey: packLowNoticeKey(purchaseId, 2),
            packPurchaseId: purchaseId,
        });

        // The job run twice tells once.
        const [job] = queued;
        await runNotices(s.organizationId, "PACK_LOW");
        await customerNotify.handle(job!);
        const emails = await emailsOf(s.organizationId, "PACK_LOW");
        expect(emails).toHaveLength(1);
        expect(emails[0]).toMatchObject({
            contactId: s.contactId,
            status: "QUEUED",
            createdByUserId: null,
        });
        expect(emails[0]!.subject).toBe("You have 1 class left at Rye Studio");
        expect(emails[0]!.body).toContain(
            "You have 1 class left in your 3-class pack.",
        );

        // The last one spent: nothing more.
        const third = await classBooking(s, 4);
        await packs.useOnBooking(s.owner, third, {
            packPurchaseId: purchaseId,
        });
        expect(await pendingNotices(s.organizationId, "PACK_LOW")).toHaveLength(
            0,
        );
    });

    it("a class given back and the same booking paid again says nothing twice", async () => {
        const { s, purchaseId } = await threeClassPack();
        await packs.useOnBooking(s.owner, await classBooking(s, 2), {
            packPurchaseId: purchaseId,
        });
        const second = await classBooking(s, 3);
        await packs.useOnBooking(s.owner, second, {
            packPurchaseId: purchaseId,
        });
        await runNotices(s.organizationId, "PACK_LOW");
        expect(await emailsOf(s.organizationId, "PACK_LOW")).toHaveLength(1);

        await packs.removeFromBooking(s.owner, second);
        await packs.useOnBooking(s.owner, second, {
            packPurchaseId: purchaseId,
        });
        await runNotices(s.organizationId, "PACK_LOW");
        expect(await emailsOf(s.organizationId, "PACK_LOW")).toHaveLength(1);
    });

    it("a new booking that brings it down to one again tells them again", async () => {
        const { s, purchaseId } = await threeClassPack();
        await packs.useOnBooking(s.owner, await classBooking(s, 2), {
            packPurchaseId: purchaseId,
        });
        const second = await classBooking(s, 3);
        await packs.useOnBooking(s.owner, second, {
            packPurchaseId: purchaseId,
        });
        await runNotices(s.organizationId, "PACK_LOW");

        await packs.removeFromBooking(s.owner, second);
        const another = await classBooking(s, 5);
        await packs.useOnBooking(s.owner, another, {
            packPurchaseId: purchaseId,
        });
        const queued = await pendingNotices(s.organizationId, "PACK_LOW");
        expect(queued[0]!.payload).toMatchObject({
            eventKey: packLowNoticeKey(purchaseId, 3),
        });
        await runNotices(s.organizationId, "PACK_LOW");
        expect(await emailsOf(s.organizationId, "PACK_LOW")).toHaveLength(2);
    });

    it("a class given back before the job runs tells nobody", async () => {
        const { s, purchaseId } = await threeClassPack();
        await packs.useOnBooking(s.owner, await classBooking(s, 2), {
            packPurchaseId: purchaseId,
        });
        const second = await classBooking(s, 3);
        await packs.useOnBooking(s.owner, second, {
            packPurchaseId: purchaseId,
        });
        await packs.removeFromBooking(s.owner, second);
        await runNotices(s.organizationId, "PACK_LOW");
        expect(await emailsOf(s.organizationId, "PACK_LOW")).toHaveLength(0);
    });

    it("with Pack credits off nothing is queued, and the spend goes through", async () => {
        const s = await packStudio({ packCredits: false });
        const pack = await makePack(s, 2);
        const purchaseId = await holding(s, pack.id, {
            credits: 2,
            expiresAt: new Date(Date.now() + 60 * DAY),
        });
        await packs.useOnBooking(s.owner, await classBooking(s, 2), {
            packPurchaseId: purchaseId,
        });
        expect((await packs.getPurchase(s.owner, purchaseId)).left).toBe(1);
        expect(await pendingNotices(s.organizationId, "PACK_LOW")).toHaveLength(
            0,
        );
    });

    it("with no email provider the customer is told in nothing but their thread, never from Saroh", async () => {
        const s = await packStudio({ email: false });
        const pack = await makePack(s, 2);
        const purchaseId = await holding(s, pack.id, {
            credits: 2,
            expiresAt: new Date(Date.now() + 60 * DAY),
        });
        await packs.useOnBooking(s.owner, await classBooking(s, 2), {
            packPurchaseId: purchaseId,
        });
        await runNotices(s.organizationId, "PACK_LOW");
        expect(await emailsOf(s.organizationId, "PACK_LOW")).toHaveLength(0);
    });
});
