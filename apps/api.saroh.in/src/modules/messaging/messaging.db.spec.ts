import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { UnauthorizedException } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import {
    countUsage,
    numberHash,
    usageLastMonths,
    usageMonth,
} from "./messaging-records";
import { MESSAGING_SEND_TYPE, MessagingService } from "./messaging.service";
import { Msg91WebhookController } from "./msg91-webhook.controller";
import { FakeMessagingProvider } from "./providers/fake-messaging-provider";
import { Msg91Provider } from "./providers/msg91.provider";
import { WalletService } from "./wallet.service";

/** The messaging core against a real database; MSG91 is a local stub or the fake. */

const SECRET = "test-msg91-webhook-secret-0123456789abcdef";
const HOUR = 60 * 60 * 1000;
const before = env.MSG91_WEBHOOK_SECRET;
const controller = new Msg91WebhookController(new WalletService());

let n = 0;
const phone = () =>
    `+9198${String(process.pid % 1000).padStart(3, "0")}${String(++n).padStart(5, "0")}`;

beforeAll(() => {
    env.MSG91_WEBHOOK_SECRET = SECRET;
});

afterAll(async () => {
    env.MSG91_WEBHOOK_SECRET = before;
    await prisma.$disconnect();
});

async function usage(channel: "OTP" | "WHATSAPP" | "SMS") {
    const row = await prisma.messagingUsage.findUnique({
        where: {
            month_channel: { month: usageMonth(new Date()), channel },
        },
    });
    return row?.count ?? 0;
}

describe("OTP widget token, against a stub MSG91", () => {
    let server: Server;
    let service: MessagingService;
    const seen: { url?: string; body: Record<string, unknown> }[] = [];

    beforeAll(async () => {
        server = createServer((req, res) => {
            let raw = "";
            req.on("data", (c: Buffer) => (raw += c.toString()));
            req.on("end", () => {
                const body = JSON.parse(raw || "{}") as Record<string, unknown>;
                seen.push({ url: req.url, body });
                const token = body["access-token"];
                if (token === "slow") return; // never answers: a timeout
                res.setHeader("Content-Type", "application/json");
                res.end(
                    JSON.stringify(
                        token === "good"
                            ? { type: "success", message: "919812345678" }
                            : {
                                  type: "error",
                                  code: "201",
                                  message: "AuthenticationFailure",
                              },
                    ),
                );
            });
        });
        // Port 0: the OS picks a free one, never one the stack uses.
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        const { port } = server.address() as AddressInfo;
        service = new MessagingService(
            new Msg91Provider({
                authKey: "stub-key",
                baseUrl: `http://127.0.0.1:${port}`,
                timeoutMs: 300,
            }),
        );
    });

    afterAll(async () => {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
    });

    it("a good token gives the verified number, and counts one OTP", async () => {
        const otp = await usage("OTP");
        await expect(
            service.verifyOtp({
                accessToken: "good",
                expectedE164: "+919812345678",
            }),
        ).resolves.toEqual({ ok: true, phoneE164: "+919812345678" });
        expect(await usage("OTP")).toBe(otp + 1);
        expect(seen.at(-1)).toEqual({
            url: "/api/v5/widget/verifyAccessToken",
            body: { authkey: "stub-key", "access-token": "good" },
        });
    });

    it("a wrong token is invalid_token and counts nothing", async () => {
        const otp = await usage("OTP");
        await expect(
            service.verifyOtp({
                accessToken: "wrong",
                expectedE164: "+919812345678",
            }),
        ).resolves.toEqual({ ok: false, reason: "invalid_token" });
        expect(await usage("OTP")).toBe(otp);
    });

    it("a token verified for another number is a mismatch", async () => {
        await expect(
            service.verifyOtp({
                accessToken: "good",
                expectedE164: "+919800000001",
            }),
        ).resolves.toEqual({ ok: false, reason: "mismatch" });
    });

    it("a token is taken once: the second use is refused (DEC-198)", async () => {
        await expect(
            service.verifyOtp({
                accessToken: "good",
                expectedE164: "+919812345678",
            }),
        ).resolves.toEqual({ ok: false, reason: "used" });
    });

    it("no answer in time is unavailable", async () => {
        await expect(
            service.verifyOtp({
                accessToken: "slow",
                expectedE164: "+919812345678",
            }),
        ).resolves.toEqual({ ok: false, reason: "unavailable" });
    });
});

describe("sends, retries and usage", () => {
    const fake = new FakeMessagingProvider();
    const service = new MessagingService(fake);

    const template = (toE164 = phone()) =>
        service.sendWhatsAppTemplate({
            toE164,
            template: "order_ready",
            category: "utility",
            variables: ["Asha"],
        });

    async function jobFor(messageId: string): Promise<Job | null> {
        return prisma.job.findFirst({
            where: {
                type: MESSAGING_SEND_TYPE,
                payload: { path: ["messageId"], equals: messageId },
            },
        });
    }

    it("accepted: SENT, keyed by the provider id, no number or words kept, counted", async () => {
        const whatsapp = await usage("WHATSAPP");
        const to = phone();
        const result = await template(to);
        expect(result.outcome).toBe("accepted");
        const row = await prisma.messagingMessage.findUniqueOrThrow({
            where: { id: (result as { messageId: string }).messageId },
        });
        expect(row).toMatchObject({
            status: "SENT",
            channel: "WHATSAPP",
            templateName: "order_ready",
            templateCategory: "utility",
            numberHash: numberHash(to),
            sealedRequest: null,
        });
        expect(row.providerMessageId).toMatch(/^fake_whatsapp_/);
        expect(row.sentAt).toBeInstanceOf(Date);
        expect(JSON.stringify(row)).not.toContain(to.slice(1));
        expect(JSON.stringify(row)).not.toContain("Asha");
        expect(await usage("WHATSAPP")).toBe(whatsapp + 1);
    });

    it("a 5xx is queued, sealed, and retried once until accepted; a rerun sends nothing", async () => {
        const whatsapp = await usage("WHATSAPP");
        fake.failNext("provider_unavailable");
        const sends = fake.messages.length;
        const result = await template();
        expect(result.outcome).toBe("queued");
        const { messageId } = result as { messageId: string };
        const queued = await prisma.messagingMessage.findUniqueOrThrow({
            where: { id: messageId },
        });
        expect(queued.status).toBe("QUEUED");
        // Sealed, not readable.
        expect(JSON.stringify(queued.sealedRequest)).not.toContain("Asha");
        const job = await jobFor(messageId);
        expect(job).not.toBeNull();

        // The retry fails again (temporary): the worker is asked to retry.
        fake.failNext("rate_limited");
        await expect(service.handleSendJob(job!)).rejects.toThrow("temporary");
        // Then it goes.
        await service.handleSendJob(job!);
        // At-least-once: a job that runs again sends nothing.
        await service.handleSendJob(job!);
        expect(fake.messages.length).toBe(sends + 3);
        const sent = await prisma.messagingMessage.findUniqueOrThrow({
            where: { id: messageId },
        });
        expect(sent).toMatchObject({ status: "SENT", sealedRequest: null });
        expect(await usage("WHATSAPP")).toBe(whatsapp + 1);
    });

    it("a network error or timeout is retried too", async () => {
        fake.failNext("throw");
        await expect(template()).resolves.toMatchObject({
            outcome: "queued",
        });
    });

    it("a 4xx is never retried: FAILED with the code, nothing queued", async () => {
        fake.failNext("refused");
        const result = await template();
        expect(result).toMatchObject({ outcome: "failed", reason: "refused" });
        const { messageId } = result as { messageId: string };
        expect(await jobFor(messageId)).toBeNull();
        expect(
            await prisma.messagingMessage.findUniqueOrThrow({
                where: { id: messageId },
            }),
        ).toMatchObject({
            status: "FAILED",
            failureReason: "refused",
            sealedRequest: null,
        });
    });

    it("the last try gives up as FAILED instead of throwing", async () => {
        fake.failNext("provider_unavailable");
        const { messageId } = (await template()) as { messageId: string };
        const job = (await jobFor(messageId))!;
        fake.failNext("provider_unavailable");
        await service.handleSendJob({
            ...job,
            attempts: job.maxAttempts - 1,
        });
        expect(
            await prisma.messagingMessage.findUniqueOrThrow({
                where: { id: messageId },
            }),
        ).toMatchObject({
            status: "FAILED",
            failureReason: "provider_unavailable",
        });
    });

    it("SMS is unavailable until DLT, and counts nothing", async () => {
        const sms = await usage("SMS");
        await expect(
            service.sendSms({ toE164: phone(), text: "x" }),
        ).resolves.toEqual({ outcome: "unavailable" });
        expect(await usage("SMS")).toBe(sms);
    });

    it("usage increments atomically and lists 12 months", async () => {
        const at = new Date(Date.UTC(2031, 4, 15));
        await Promise.all(
            Array.from({ length: 8 }, () => countUsage("SMS", at)),
        );
        const months = await usageLastMonths(at);
        expect(months).toHaveLength(12);
        expect(months[0]).toEqual({
            month: "2031-05",
            otp: 0,
            whatsapp: 0,
            sms: 8,
        });
        expect(months[11]?.month).toBe("2030-06");
    });
});

describe("the webhook for every send", () => {
    const fake = new FakeMessagingProvider();
    const service = new MessagingService(fake);

    const inbound = (from: string, uuid: string, ts?: string) =>
        controller.handle(SECRET, {
            requestId: "",
            uuid,
            eventName: "delivered",
            customerNumber: from.slice(1),
            contentType: "text",
            text: "Hi",
            ...(ts ? { ts } : {}),
        });

    async function accepted() {
        const result = await service.sendWhatsAppTemplate({
            toE164: phone(),
            template: "order_ready",
            category: "utility",
            variables: [],
        });
        const row = await prisma.messagingMessage.findUniqueOrThrow({
            where: { id: (result as { messageId: string }).messageId },
        });
        return { id: row.id, providerId: row.providerMessageId! };
    }

    const status = (providerId: string, eventName: string, reason = "") =>
        controller.handle(SECRET, {
            requestId: providerId,
            uuid: `wamid.${providerId}`,
            eventName,
            reason,
            direction: "1",
        });

    const row = (id: string) =>
        prisma.messagingMessage.findUniqueOrThrow({ where: { id } });

    it("a bad secret is 401 and stores nothing", async () => {
        const from = phone();
        await expect(
            controller.handle("wrong", {
                uuid: "wamid.bad",
                direction: "0",
                customerNumber: from.slice(1),
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(
            await prisma.messagingContactWindow.findUnique({
                where: { numberHash: numberHash(from) },
            }),
        ).toBeNull();
    });

    it("delivered, then read: each time stamped; failed keeps only the code", async () => {
        const a = await accepted();
        await status(a.providerId, "delivered");
        await status(a.providerId, "read");
        const r = await row(a.id);
        expect(r.status).toBe("READ");
        expect(r.deliveredAt).toBeInstanceOf(Date);
        expect(r.readAt).toBeInstanceOf(Date);

        const b = await accepted();
        await status(
            b.providerId,
            "failed",
            "131026: Message undeliverable to +91…",
        );
        expect(await row(b.id)).toMatchObject({
            status: "FAILED",
            failureReason: "whatsapp_131026",
        });
    });

    it("a repeated event is a no-op", async () => {
        const a = await accepted();
        await status(a.providerId, "delivered");
        const first = (await row(a.id)).deliveredAt;
        await status(a.providerId, "delivered");
        expect((await row(a.id)).deliveredAt).toEqual(first);
        expect(
            await prisma.messagingWebhookEvent.count({
                where: { eventId: a.providerId, status: "DELIVERED" },
            }),
        ).toBe(1);
    });

    it("an out-of-order status never goes backward", async () => {
        const a = await accepted();
        await status(a.providerId, "read");
        await status(a.providerId, "delivered");
        await status(a.providerId, "failed");
        expect(await row(a.id)).toMatchObject({
            status: "READ",
            deliveredAt: null,
            failedAt: null,
        });
    });

    it("an inbound message opens the 24-hour window for a free-form reply", async () => {
        const to = phone();
        const sends = fake.messages.length;
        await expect(
            service.sendWhatsAppText({
                toE164: to,
                text: "Your order is ready",
            }),
        ).resolves.toEqual({
            outcome: "refused",
            reason: "outside_reply_window",
        });
        expect(fake.messages.length).toBe(sends);

        await inbound(to, `wamid.in-${to}`);
        await expect(
            service.sendWhatsAppText({
                toE164: to,
                text: "Your order is ready",
            }),
        ).resolves.toMatchObject({ outcome: "accepted" });
        // Inbound stores the hash and the time, never the number or the words.
        const window = await prisma.messagingContactWindow.findUniqueOrThrow({
            where: { numberHash: numberHash(to) },
        });
        expect(JSON.stringify(window)).not.toContain(to.slice(1));
    });

    it("an inbound number without 91 opens the same window (review 28 Oct)", async () => {
        const to = phone();
        await controller.handle(SECRET, {
            requestId: "",
            uuid: `wamid.bare-${to}`,
            eventName: "delivered",
            customerNumber: to.slice(3),
            contentType: "text",
            text: "Hi",
        });
        await expect(
            service.sendWhatsAppText({ toE164: to, text: "x" }),
        ).resolves.toMatchObject({ outcome: "accepted" });
    });

    it("a message older than 24 hours doesn't open it, and never moves it back", async () => {
        const to = phone();
        const old = new Date(Date.now() - 25 * HOUR).toISOString();
        await inbound(to, `wamid.old-${to}`, old);
        await expect(
            service.sendWhatsAppText({ toE164: to, text: "x" }),
        ).resolves.toMatchObject({ outcome: "refused" });

        await inbound(to, `wamid.new-${to}`);
        await inbound(to, `wamid.older-${to}`, old);
        await expect(
            service.sendWhatsAppText({ toE164: to, text: "x" }),
        ).resolves.toMatchObject({ outcome: "accepted" });
    });

    it("an unknown id or an unreadable body is still a 200", async () => {
        for (const body of [
            null,
            [],
            { direction: "0" },
            { requestId: "nobody-knows", eventName: "delivered" },
        ]) {
            await expect(controller.handle(SECRET, body)).resolves.toEqual({
                ok: true,
            });
        }
    });
});
