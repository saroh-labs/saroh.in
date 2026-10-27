import { UnauthorizedException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import { Msg91WebhookController } from "./msg91-webhook.controller";
import { WalletService } from "./wallet.service";

/** MSG91 delivery reports (#1243) against a real database. Paise values are arbitrary. */

const SECRET = "test-msg91-webhook-secret-0123456789abcdef";
const PRICE = 70;
const HOUR = 60 * 60 * 1000;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const wallet = new WalletService();
const controller = new Msg91WebhookController(wallet);
const before = env.MSG91_WEBHOOK_SECRET;

beforeAll(() => {
    env.MSG91_WEBHOOK_SECRET = SECRET;
});

afterAll(async () => {
    env.MSG91_WEBHOOK_SECRET = before;
    await prisma.$disconnect();
});

/** A business with a held WhatsApp send that MSG91 accepted. */
async function sentWhatsapp(createdAt?: Date) {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: uniq("dlr") },
    });
    await wallet.credit(org.id, 1000);
    await expect(wallet.hold(org.id, PRICE)).resolves.toEqual({ ok: true });
    const verification = await prisma.phoneVerification.create({
        data: {
            organizationId: org.id,
            module: "BOOKING",
            phoneE164: "+919800000000",
            codeHash: "hash",
            expiresAt: new Date(Date.now() + HOUR),
        },
    });
    const requestId = uniq("req");
    const send = await prisma.messagingSend.create({
        data: {
            organizationId: org.id,
            verificationId: verification.id,
            channel: "WHATSAPP",
            pricePaise: PRICE,
            status: "SENT",
            providerMessageId: requestId,
            ...(createdAt ? { createdAt } : {}),
        },
    });
    return { orgId: org.id, sendId: send.id, requestId };
}

const report = (requestId: string, eventName: string, reason = "") =>
    controller.handle(SECRET, {
        requestId,
        uuid: `wamid.${requestId}`,
        eventName,
        reason,
        customerNumber: "919800000000",
        direction: "1",
    });

async function state(orgId: string, sendId: string) {
    const send = await prisma.messagingSend.findUniqueOrThrow({
        where: { id: sendId },
    });
    const kinds = (
        await prisma.messagingLedgerEntry.findMany({
            where: { organizationId: orgId, sendId },
        })
    )
        .map((e) => e.kind)
        .sort();
    return {
        status: send.status,
        failureReason: send.failureReason,
        kinds,
        wallet: await wallet.get(orgId),
    };
}

describe("MSG91 delivery reports", () => {
    it("delivered: DELIVERED and charged once", async () => {
        const { orgId, sendId, requestId } = await sentWhatsapp();
        await expect(report(requestId, "delivered")).resolves.toEqual({
            ok: true,
        });
        const s = await state(orgId, sendId);
        expect(s.status).toBe("DELIVERED");
        expect(s.kinds).toEqual(["DEBIT"]);
        expect(s.wallet).toMatchObject({
            balancePaise: 1000 - PRICE,
            heldPaise: 0,
        });
    });

    it("read after delivered: READ, no second charge", async () => {
        const { orgId, sendId, requestId } = await sentWhatsapp();
        await report(requestId, "delivered");
        await report(requestId, "read");
        const s = await state(orgId, sendId);
        expect(s.status).toBe("READ");
        expect(s.kinds).toEqual(["DEBIT"]);
        expect(s.wallet.balancePaise).toBe(1000 - PRICE);
    });

    it("read first: charged once, and a late delivered doesn't go back", async () => {
        const { orgId, sendId, requestId } = await sentWhatsapp();
        await report(requestId, "read");
        await report(requestId, "delivered");
        const s = await state(orgId, sendId);
        expect(s.status).toBe("READ");
        expect(s.kinds).toEqual(["DEBIT"]);
        expect(s.wallet.balancePaise).toBe(1000 - PRICE);
    });

    it("failed: FAILED with only the error code, given back, never charged", async () => {
        const { orgId, sendId, requestId } = await sentWhatsapp();
        await report(
            requestId,
            "failed",
            "131049: This message was not delivered to maintain healthy ecosystem engagement.",
        );
        const s = await state(orgId, sendId);
        expect(s.status).toBe("FAILED");
        expect(s.failureReason).toBe("whatsapp_131049");
        expect(s.kinds).toEqual(["RELEASE"]);
        expect(s.wallet).toMatchObject({ balancePaise: 1000, heldPaise: 0 });
    });

    it("a duplicate delivered charges once", async () => {
        const { orgId, sendId, requestId } = await sentWhatsapp();
        await Promise.all([
            report(requestId, "delivered"),
            report(requestId, "delivered"),
        ]);
        await report(requestId, "delivered");
        const s = await state(orgId, sendId);
        expect(s.kinds).toEqual(["DEBIT"]);
        expect(s.wallet.balancePaise).toBe(1000 - PRICE);
    });

    it("matches on the message uuid too", async () => {
        const { orgId, sendId, requestId } = await sentWhatsapp();
        await controller.handle(SECRET, {
            uuid: requestId,
            eventName: "delivered",
        });
        expect((await state(orgId, sendId)).kinds).toEqual(["DEBIT"]);
    });

    it("delivered after the stale sweep gave it back: no charge", async () => {
        const { orgId, sendId, requestId } = await sentWhatsapp(
            new Date(Date.now() - 25 * HOUR),
        );
        await wallet.expireSweep(new Date());
        await report(requestId, "delivered");
        const s = await state(orgId, sendId);
        expect(s.kinds).toEqual(["RELEASE"]);
        expect(s.wallet).toMatchObject({ balancePaise: 1000, heldPaise: 0 });
    });

    it("a bad or missing secret is 401 and changes nothing", async () => {
        const { orgId, sendId, requestId } = await sentWhatsapp();
        const body = { requestId, eventName: "delivered" };
        await expect(controller.handle("wrong", body)).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
        await expect(controller.handle(undefined, body)).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
        const s = await state(orgId, sendId);
        expect(s.status).toBe("SENT");
        expect(s.kinds).toEqual([]);
        expect(s.wallet.heldPaise).toBe(PRICE);
    });

    it("an unknown id or an unreadable body is a 200 no-op", async () => {
        await expect(report(uniq("nobody"), "delivered")).resolves.toEqual({
            ok: true,
        });
        for (const body of [null, "x", 42, {}, { requestId: 1 }, []]) {
            await expect(controller.handle(SECRET, body)).resolves.toEqual({
                ok: true,
            });
        }
    });
});
