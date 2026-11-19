import { createHmac } from "node:crypto";

import {
    ForbiddenException,
    Logger,
    type RawBodyRequest,
    UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { Request } from "express";

import { env } from "../../env";
import { inReplyWindow, numberHash } from "./messaging-records";
import { MetaWebhookController } from "./meta-webhook.controller";
import { WalletService } from "./wallet.service";
import {
    MemoryHealthStore,
    WhatsappSignInHealth,
} from "./whatsapp-signin-health";

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

    it("a message to another number on the account opens no window", async () => {
        const was = env.META_WA_PHONE_NUMBER_ID;
        env.META_WA_PHONE_NUMBER_ID = "5550001111";
        try {
            const from = "919811144455";
            await post(
                envelope({
                    messages: [
                        {
                            from,
                            id: `wamid.${uniq("other")}`,
                            timestamp: String(Math.floor(Date.now() / 1000)),
                            type: "text",
                            text: { body: "Hi" },
                        },
                    ],
                }),
            );
            expect(await inReplyWindow(numberHash(`+${from}`))).toBe(false);
        } finally {
            env.META_WA_PHONE_NUMBER_ID = was;
        }
    });
});

// Owner, 19 Nov: a sign-in code Meta couldn't deliver, or the sign-in
// template going bad, reaches Saroh even though nobody sees it fail.
describe("Meta webhooks Saroh watches sign-in codes by", () => {
    let error: jest.SpyInstance;
    let alert: jest.Mock;
    let health: WhatsappSignInHealth;
    let watched: MetaWebhookController;
    beforeEach(() => {
        error = jest
            .spyOn(Logger.prototype, "error")
            .mockImplementation(() => {});
        alert = jest.fn().mockResolvedValue(1);
        health = new WhatsappSignInHealth(
            new MemoryHealthStore(),
            { send: alert },
            5,
            30,
            "saroh_login_code",
        );
        watched = new MetaWebhookController(wallet, health);
    });
    afterEach(() => error.mockRestore());

    function signed(body: unknown) {
        const rawBody = Buffer.from(JSON.stringify(body));
        return watched.handle(sign(rawBody), {
            rawBody,
        } as RawBodyRequest<Request>);
    }
    const failedStatus = (wamid: string, code: number) =>
        signed(
            envelope({
                statuses: [
                    {
                        id: wamid,
                        status: "failed",
                        recipient_id: "919800000000",
                        errors: [{ code, title: "x" }],
                    },
                ],
            }),
        );
    const templateChange = (field: string, value: Record<string, unknown>) =>
        signed({
            object: "whatsapp_business_account",
            entry: [{ id: "waba", changes: [{ field, value }] }],
        });

    it("counts Meta's failed status for a sign-in code once, and alerts on an account-level code", async () => {
        const wamid = `wamid.${uniq("signin")}`;
        await health.sent(wamid);
        await expect(failedStatus(wamid, 131042)).resolves.toEqual({
            ok: true,
        });
        await failedStatus(wamid, 131042);
        await failedStatus(`wamid.${uniq("other")}`, 131042);
        await expect(health.lastHour()).resolves.toMatchObject({
            sends: 1,
            failures: 1,
            lastError: "whatsapp_131042",
        });
        expect(alert).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0]?.[0])).toContain(
            "account_phone_whatsapp_account_error reason=whatsapp_131042",
        );
    });

    it("alerts once when the sign-in template is paused, and ignores other templates and fields", async () => {
        const paused = {
            event: "PAUSED",
            message_template_id: 1,
            message_template_name: "saroh_login_code",
            message_template_language: "en_US",
            reason: "NONE",
        };
        await expect(
            templateChange("message_template_status_update", paused),
        ).resolves.toEqual({ ok: true });
        await templateChange("message_template_status_update", paused);
        await templateChange("message_template_status_update", {
            ...paused,
            message_template_name: "order_update",
            event: "DISABLED",
        });
        await expect(
            templateChange("account_update", { event: "DISABLED" }),
        ).resolves.toEqual({ ok: true });
        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert.mock.calls[0][0].subject).toContain("paused");
    });

    it("alerts when the sign-in template's quality drops to RED", async () => {
        await templateChange("message_template_quality_update", {
            previous_quality_score: "YELLOW",
            new_quality_score: "RED",
            message_template_id: 1,
            message_template_name: "saroh_login_code",
            message_template_language: "en_US",
        });
        expect(alert).toHaveBeenCalledTimes(1);
    });
});
