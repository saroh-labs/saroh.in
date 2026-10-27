import { createHmac } from "node:crypto";

import type { MessagingUsageChannel } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { EncryptedSecret, EncryptionKey } from "../../common/crypto";
import { decryptWithKey, encryptWithKey } from "../../common/crypto";
import { declaredNodeEnv, env } from "../../env";
import { visitorHashSecret } from "../analytics/visitor-hash";

/**
 * The messaging core's own rows (MSG91 brief, 27 Oct): number hashes, the
 * 24-hour reply window, monthly usage and the sealed request a retry
 * reads. Platform-level: no organization.
 */

/** Meta's customer service window: a free-form reply only this long after the number wrote. */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A number as stored: an HMAC under the server's secret, as a caller's
 * address is (`common/client-ip.ts`). A plain hash of a phone number is
 * brute-forced offline; this is not without the secret.
 */
export function numberHash(e164: string): string {
    return createHmac("sha256", visitorHashSecret())
        .update(`messaging-number:+${e164.replace(/\D/g, "")}`)
        .digest("hex");
}

/** "YYYY-MM" in UTC. */
export function usageMonth(at: Date): string {
    return at.toISOString().slice(0, 7);
}

/** One more accepted message this month: one atomic upsert. */
export async function countUsage(
    channel: MessagingUsageChannel,
    at = new Date(),
): Promise<void> {
    const month = usageMonth(at);
    await prisma.messagingUsage.upsert({
        where: { month_channel: { month, channel } },
        create: { month, channel, count: 1 },
        update: { count: { increment: 1 } },
    });
}

export interface UsageMonth {
    month: string;
    otp: number;
    whatsapp: number;
    sms: number;
}

/** The last 12 months, newest first, every month listed (zeros included). */
export async function usageLastMonths(now = new Date()): Promise<UsageMonth[]> {
    const months = Array.from({ length: 12 }, (_, i) =>
        usageMonth(
            new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)),
        ),
    );
    const rows = await prisma.messagingUsage.findMany({
        where: { month: { in: months } },
    });
    return months.map((month) => {
        const of = (channel: MessagingUsageChannel) =>
            rows.find((r) => r.month === month && r.channel === channel)
                ?.count ?? 0;
        return {
            month,
            otp: of("OTP"),
            whatsapp: of("WHATSAPP"),
            sms: of("SMS"),
        };
    });
}

/** A number wrote to Saroh's WhatsApp at `at`; the window only moves forward. */
export async function noteInbound(hash: string, at: Date): Promise<void> {
    await prisma.$executeRaw`
        INSERT INTO "MessagingContactWindow" ("numberHash", "lastInboundAt", "updatedAt")
        VALUES (${hash}, ${at}, NOW())
        ON CONFLICT ("numberHash") DO UPDATE
        SET "lastInboundAt" = GREATEST("MessagingContactWindow"."lastInboundAt", EXCLUDED."lastInboundAt"),
            "updatedAt" = NOW()`;
}

/** Whether a free-form reply to this number is inside Meta's 24-hour window. */
export async function inReplyWindow(
    hash: string,
    now = new Date(),
): Promise<boolean> {
    const row = await prisma.messagingContactWindow.findUnique({
        where: { numberHash: hash },
        select: { lastInboundAt: true },
    });
    return (
        !!row && now.getTime() - row.lastInboundAt.getTime() < REPLY_WINDOW_MS
    );
}

/** The public development key: never used outside development and test. */
const DEV_KEY =
    "6d6573736167696e672d6465762d6b65792d6e6f742d7365637265742d2d2d21";

function messagingKey(): EncryptionKey {
    const devOrTest =
        declaredNodeEnv === "development" || declaredNodeEnv === "test";
    return {
        name: "MESSAGING_ENC_KEY",
        value: env.MESSAGING_ENC_KEY ?? (devOrTest ? DEV_KEY : undefined),
        protects: "a queued message",
    };
}

/** Seal a send's number and words while it waits to be accepted. */
export function sealRequest(request: unknown): EncryptedSecret {
    return encryptWithKey(JSON.stringify(request), messagingKey());
}

export function openRequest<T>(sealed: EncryptedSecret): T {
    return JSON.parse(decryptWithKey(sealed, messagingKey())) as T;
}
