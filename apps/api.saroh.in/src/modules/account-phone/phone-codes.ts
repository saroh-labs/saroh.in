import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import type { AccountPhoneCodePurpose } from "@saroh/database";
import { prisma } from "@saroh/database";

import { siteCodeSecret } from "../site-accounts/site-secrets";

/**
 * WhatsApp sign-in codes for Saroh accounts, made and checked here and sent
 * from Saroh's own number (owner, 28 Oct 2026: "widget is for SMS"). The
 * row keeps HMACs only, under the site sign-in code secret, as
 * `messaging/verification.service.ts` does.
 */
export const CODE_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;

export type CodeCheck = "ok" | "wrong_code" | "too_many_attempts" | "no_code";

function hash(phoneHash: string, code: string): string {
    return createHmac("sha256", siteCodeSecret())
        .update(["account-phone-code", phoneHash, code].join("\n"))
        .digest("hex");
}

/** Six digits, to send; the row keeps only its hash. */
export function newCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function saveCode(input: {
    phoneHash: string;
    code: string;
    purpose: AccountPhoneCodePurpose;
    userId?: string;
}): Promise<void> {
    await prisma.accountPhoneCode.create({
        data: {
            phoneHash: input.phoneHash,
            codeHash: hash(input.phoneHash, input.code),
            purpose: input.purpose,
            userId: input.userId ?? null,
            expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
        },
        select: { id: true },
    });
}

/**
 * Check a typed code against the newest unused, unexpired code for this
 * number and purpose (and person, for ADD). Each try is counted first, in
 * one conditional update, so parallel checks can't spend more than five
 * tries between them nor both use the code.
 */
export async function checkCode(input: {
    phoneHash: string;
    code: string;
    purpose: AccountPhoneCodePurpose;
    userId?: string;
}): Promise<CodeCheck> {
    const now = new Date();
    const live = await prisma.accountPhoneCode.findFirst({
        where: {
            phoneHash: input.phoneHash,
            purpose: input.purpose,
            userId: input.userId ?? null,
            usedAt: null,
            expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, codeHash: true, attempts: true },
    });
    if (!live) return "no_code";
    if (live.attempts >= CODE_MAX_ATTEMPTS) return "too_many_attempts";

    const open = { id: live.id, usedAt: null, expiresAt: { gt: now } };
    const counted = await prisma.accountPhoneCode.updateMany({
        where: { ...open, attempts: { lt: CODE_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) return "too_many_attempts";

    if (sameHash(hash(input.phoneHash, input.code), live.codeHash)) {
        const used = await prisma.accountPhoneCode.updateMany({
            where: open,
            data: { usedAt: now },
        });
        return used.count === 1 ? "ok" : "no_code";
    }
    return live.attempts + 1 >= CODE_MAX_ATTEMPTS
        ? "too_many_attempts"
        : "wrong_code";
}

function sameHash(a: string, b: string): boolean {
    const x = Buffer.from(a, "hex");
    const y = Buffer.from(b, "hex");
    return x.length === y.length && timingSafeEqual(x, y);
}
