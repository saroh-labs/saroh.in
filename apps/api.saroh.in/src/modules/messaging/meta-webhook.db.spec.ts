import { createHmac } from "node:crypto";

import {
    ForbiddenException,
    type RawBodyRequest,
    UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { Request } from "express";

import { env } from "../../env";
import { inReplyWindow, numberHash } from "./messaging-records";
import { MetaWebhookController } from "./meta-webhook.controller";
import { WalletService } from "./wallet.service";

/** Meta's WhatsApp webhook (#1374 U2) against a real database. Paise values are arbitrary. */

const APP_SECRET = "test-meta-app-secret-0123456789abcdef";
const VERIFY = "test-meta-verify-token";
const PRICE = 70;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const wallet = new WalletService();
const controller = new MetaWebhookController(wallet);
const before = {
    secret: env.META_APP_SECRET,
    verify: env.META_WA_WEBHOOK_VERIFY_TOKEN,
};

beforeAll(() => {
    env.META_APP_SECRET = APP_SECRET;
    env.META_WA_WEBHOOK_VERIFY_TOKEN = VERIFY;
});

afterAll(async () => {
    env.META_APP_SECRET = before.secret;
    env.META_WA_WEBHOOK_VERIFY_TOKEN = before.verify;
    await prisma.$disconnect();
});

const sign = (raw: Buffer, secret = APP_SECRET) =>
    `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

/** POST as Meta would: the raw bytes, signed unless told otherwise. */
function post(body: unknown, signature?: string | null) {
    const rawBody = Buffer.from(JSON.stringify(body));
    return controller.handle(
        signature === null ? undefined : (signature ?? sign(rawBody)),
        { rawBody } as RawBodyRequest<Request>,
    );
}

const envelope = (value: Record<string, unknown>) => ({
    object: "whatsapp_business_account",
    entry: [
        {
            id: "waba",
            changes: [
                {
                    field: "messages",
                    value: {
                        messaging_product: "whatsapp",
                        metadata: { phone_number_id: "1234567890" },
                        ...value,
                    },
                },
            ],
        },
    ],
});

const status = (wamid: string, s: string, code?: number) =>
    post(
        envelope({
            statuses: [
                {
                    id: wamid,
                    status: s,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    recipient_id: "919800000000",
                    ...(code ? { errors: [{ code, title: "x" }] } : {}),
                },
            ],
        }),
    );

/** A business with a held WhatsApp send that Meta accepted. */
async function sentWhatsapp() {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: uniq("meta") },
    });
    await wallet.credit(org.id, 1000);
    await expect(wallet.hold(org.id, PRICE)).resolves.toEqual({ ok: true });
    const verification = await prisma.phoneVerification.create({
        data: {
            organizationId: org.id,
            module: "BOOKING",
            phoneE164: "+919800000000",
            codeHash: "hash",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
    });
    const wamid = `wamid.${uniq("m")}`;
    const send = await prisma.messagingSend.create({
        data: {
            organizationId: org.id,
            verificationId: verification.id,
            channel: "WHATSAPP",
            pricePaise: PRICE,
            status: "SENT",
            providerMessageId: wamid,
        },
    });
    return { orgId: org.id, sendId: send.id, wamid };
}

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

describe("Meta webhook verify handshake", () => {
    it("answers the challenge only for subscribe with our token", () => {
        expect(controller.verify("subscribe", VERIFY, "1158201444")).toBe(
            "1158201444",
        );
        for (const [mode, token] of [
            ["subscribe", "wrong"],
            ["subscribe", undefined],
            ["unsubscribe", VERIFY],
            [undefined, VERIFY],
        ]) {
            expect(() => controller.verify(mode, token, "1")).toThrow(
                ForbiddenException,
            );
        }
    });
});

describe("Meta delivery reports", () => {
    it("delivered: DELIVERED and charged once; a repeat doesn't charge again", async () => {
        const { orgId, sendId, wamid } = await sentWhatsapp();
        await expect(status(wamid, "delivered")).resolves.toEqual({
            ok: true,
        });
        await status(wamid, "delivered");
        const s = await state(orgId, sendId);
        expect(s.status).toBe("DELIVERED");
        expect(s.kinds).toEqual(["DEBIT"]);
        expect(s.wallet).toMatchObject({
            balancePaise: 1000 - PRICE,
            heldPaise: 0,
        });
    });

    it("failed: FAILED with Meta's code only, given back", async () => {
        const { orgId, sendId, wamid } = await sentWhatsapp();
        await status(wamid, "failed", 131026);
        const s = await state(orgId, sendId);
        expect(s.status).toBe("FAILED");
        expect(s.failureReason).toBe("whatsapp_131026");
        expect(s.kinds).toEqual(["RELEASE"]);
        expect(s.wallet).toMatchObject({ balancePaise: 1000, heldPaise: 0 });
    });

    it("read after delivered moves forward; sent after delivered is ignored", async () => {
        const { orgId, sendId, wamid } = await sentWhatsapp();
        await status(wamid, "delivered");
        await status(wamid, "sent");
        expect((await state(orgId, sendId)).status).toBe("DELIVERED");
        await status(wamid, "read");
        const s = await state(orgId, sendId);
        expect(s.status).toBe("READ");
        expect(s.kinds).toEqual(["DEBIT"]);
    });

    it("a bad or missing signature is 401 and changes nothing", async () => {
        const { orgId, sendId, wamid } = await sentWhatsapp();
        const body = envelope({
            statuses: [{ id: wamid, status: "delivered" }],
        });
        await expect(
            post(body, sign(Buffer.from("other"))),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(
            post(
                body,
                sign(Buffer.from(JSON.stringify(body)), "not-the-secret"),
            ),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(post(body, null)).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
        await expect(
            controller.handle("sha256=00", {} as RawBodyRequest<Request>),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        const s = await state(orgId, sendId);
        expect(s.status).toBe("SENT");
        expect(s.kinds).toEqual([]);
        expect(s.wallet.heldPaise).toBe(PRICE);
    });

    it("an unknown wamid or an unreadable signed body is a 200 no-op", async () => {
        const events = await prisma.messagingWebhookEvent.count();
        await expect(
            status(`wamid.${uniq("nobody")}`, "delivered"),
        ).resolves.toEqual({
            ok: true,
        });
        for (const body of [null, "x", 42, {}, { entry: [{ changes: 1 }] }]) {
            await expect(post(body)).resolves.toEqual({ ok: true });
        }
        const raw = Buffer.from("not json");
        await expect(
            controller.handle(sign(raw), {
                rawBody: raw,
            } as RawBodyRequest<Request>),
        ).resolves.toEqual({ ok: true });
        // Only the unknown id's own event is remembered; no send moved.
        expect(await prisma.messagingWebhookEvent.count()).toBe(events + 1);
    });

    it("an inbound message opens the reply window by the number's hash, storing no number", async () => {
        const from = "919811122233";
        const hash = numberHash(`+${from}`);
        expect(await inReplyWindow(hash)).toBe(false);
        await post(
            envelope({
                contacts: [{ wa_id: from, profile: { name: "Asha" } }],
                messages: [
                    {
                        from,
                        id: `wamid.${uniq("in")}`,
                        timestamp: String(Math.floor(Date.now() / 1000)),
                        type: "text",
                        text: { body: "Hello" },
                    },
                ],
            }),
        );
        expect(await inReplyWindow(hash)).toBe(true);
        const rows = await prisma.messagingContactWindow.findMany();
        expect(JSON.stringify(rows)).not.toContain(from);
    });
});
