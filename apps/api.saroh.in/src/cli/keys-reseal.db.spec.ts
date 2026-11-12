/**
 * The key ring's re-seal against a real Postgres (DEC-214): values sealed
 * under today's single keys move onto a newer key, still open to the same
 * plaintext, keep their `updatedAt`, and a second run moves nothing. API
 * keys can't be re-fingerprinted, so they are counted, and move on use.
 */
import { randomBytes } from "node:crypto";

import { prisma } from "@saroh/database";

import { decryptWithKey, storedKeyId } from "../common/crypto";
import { env } from "../env";
import {
    generateManagerCode,
    sealTaxId,
    staffPiiKey,
} from "../modules/admin/staff-profile";
import {
    ApiKeysService,
    tokenDigest,
} from "../modules/api-keys/api-keys.service";
import type { AuditService } from "../modules/audit/audit.service";
import { MESSAGE_SEND_TYPE } from "../modules/communications/message-send.handler";
import {
    messagingKey,
    openRequest,
    sealRequest,
} from "../modules/messaging/messaging-records";
import {
    sealSecret,
    webhookSecretKey,
} from "../modules/outbound-webhooks/endpoints.service";
import { decryptSecret, encryptSecret } from "../modules/payments/crypto";
import { resealAll } from "./keys-reseal";

const NAMES = [
    "PAYMENTS_ENC_KEY",
    "STAFF_PII_ENC_KEY",
    "MESSAGING_ENC_KEY",
    "WEBHOOK_SECRET_KEY",
    "APIKEY_ENC_KEY",
] as const;
const mutableEnv = env as Partial<Record<(typeof NAMES)[number], string>>;
const before = { ...mutableEnv };
// Throwaway keys for this run only, never a value in the repo.
const fresh = () => randomBytes(32).toString("base64");
const oldKeys = Object.fromEntries(NAMES.map((n) => [n, fresh()]));
const ringed = () => {
    for (const n of NAMES) mutableEnv[n] = `v2:${fresh()},v1:${oldKeys[n]}`;
};

const tag = `${process.pid}-${Date.now()}`;
const token = `sk_live_${"k".repeat(43)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
    for (const n of NAMES) mutableEnv[n] = oldKeys[n];
    const org = await prisma.organization.create({
        data: { name: "Keyring", slug: `keyring-${tag}` },
    });
    const user = await prisma.user.create({
        data: { email: `keyring-${tag}@example.com`, name: "Meera" },
    });
    const admin = await prisma.platformAdmin.create({
        data: { userId: user.id },
    });
    const creds = encryptSecret(
        JSON.stringify({ keyId: "rzp_x", keySecret: "s" }),
    );
    ids.provider = (
        await prisma.merchantPaymentProvider.create({
            data: {
                organizationId: org.id,
                provider: "RAZORPAY",
                encryptedCredentials: creds.ciphertext,
                credentialsIv: creds.iv,
                credentialsAuthTag: creds.authTag,
            },
        })
    ).id;
    ids.job = (
        await prisma.job.create({
            data: {
                type: MESSAGE_SEND_TYPE,
                payload: {
                    messageId: "m",
                    deliveryId: "d",
                    link: { ...encryptSecret("https://pay.example.com/x") },
                },
            },
        })
    ).id;
    const tax = sealTaxId("ABCDE1234F");
    ids.staff = (
        await prisma.staffProfile.create({
            data: {
                platformAdminId: admin.id,
                worksAs: "OTHER",
                managerCode: generateManagerCode(),
                taxIdCiphertext: tax.ciphertext,
                taxIdIv: tax.iv,
                taxIdAuthTag: tax.authTag,
            },
        })
    ).id;
    ids.message = (
        await prisma.messagingMessage.create({
            data: {
                channel: "WHATSAPP",
                numberHash: "h",
                sealedRequest: { ...sealRequest({ to: "x" }) },
            },
        })
    ).id;
    const secret = sealSecret("whsec_one");
    ids.endpoint = (
        await prisma.webhookEndpoint.create({
            data: {
                organizationId: org.id,
                createdByUserId: user.id,
                url: "https://hooks.example.com/in",
                secretCiphertext: secret.ciphertext,
                secretIv: secret.iv,
                secretAuthTag: secret.authTag,
            },
        })
    ).id;
    ids.apiKey = (
        await prisma.apiKey.create({
            data: {
                organizationId: org.id,
                createdByUserId: user.id,
                kind: "SECRET",
                edition: "INDIA",
                name: "Server",
                prefix: token.slice(0, 12),
                tokenDigest: tokenDigest(token),
            },
        })
    ).id;
    ringed();
});

afterAll(() => {
    Object.assign(mutableEnv, before);
});

const sealedNow = async () => {
    const p = await prisma.merchantPaymentProvider.findUniqueOrThrow({
        where: { id: ids.provider },
    });
    const j = await prisma.job.findUniqueOrThrow({ where: { id: ids.job } });
    const s = await prisma.staffProfile.findUniqueOrThrow({
        where: { id: ids.staff },
    });
    const m = await prisma.messagingMessage.findUniqueOrThrow({
        where: { id: ids.message },
    });
    const w = await prisma.webhookEndpoint.findUniqueOrThrow({
        where: { id: ids.endpoint },
    });
    return { p, j, s, m, w };
};

describe("keys reseal", () => {
    it("a dry run counts what would move and writes nothing", async () => {
        const was = await sealedNow();
        const r = await resealAll({ dryRun: true });
        for (const t of r.targets) {
            expect(t.newest).toBe("v2");
            expect(t.cannotOpen).toBe(0);
        }
        const moved = r.targets.reduce((a, t) => a + (t.moved.v1 ?? 0), 0);
        expect(moved).toBe(5);
        expect(await sealedNow()).toEqual(was);
    });

    it("moves every value onto v2, still opening, updatedAt kept, then nothing", async () => {
        const was = await sealedNow();
        const r = await resealAll({ dryRun: false });
        expect(r.targets.every((t) => t.changedMeanwhile === 0)).toBe(true);

        const now = await sealedNow();
        expect(storedKeyId(now.p.encryptedCredentials)).toBe("v2");
        expect(
            JSON.parse(
                decryptSecret({
                    ciphertext: now.p.encryptedCredentials,
                    iv: now.p.credentialsIv,
                    authTag: now.p.credentialsAuthTag,
                }),
            ),
        ).toEqual({ keyId: "rzp_x", keySecret: "s" });
        expect(now.p.updatedAt).toEqual(was.p.updatedAt);

        const link = (
            now.j.payload as {
                link: { ciphertext: string; iv: string; authTag: string };
            }
        ).link;
        expect(storedKeyId(link.ciphertext)).toBe("v2");
        expect(decryptSecret(link)).toBe("https://pay.example.com/x");

        expect(storedKeyId(now.s.taxIdCiphertext!)).toBe("v2");
        expect(
            decryptWithKey(
                {
                    ciphertext: now.s.taxIdCiphertext!,
                    iv: now.s.taxIdIv!,
                    authTag: now.s.taxIdAuthTag!,
                },
                staffPiiKey(),
            ),
        ).toBe("ABCDE1234F");

        const req = now.m.sealedRequest as {
            ciphertext: string;
            iv: string;
            authTag: string;
        };
        expect(storedKeyId(req.ciphertext)).toBe("v2");
        expect(openRequest(req)).toEqual({ to: "x" });
        expect(messagingKey().name).toBe("MESSAGING_ENC_KEY");

        expect(storedKeyId(now.w.secretCiphertext)).toBe("v2");
        expect(
            decryptWithKey(
                {
                    ciphertext: now.w.secretCiphertext,
                    iv: now.w.secretIv,
                    authTag: now.w.secretAuthTag,
                },
                webhookSecretKey(),
            ),
        ).toBe("whsec_one");

        const again = await resealAll({ dryRun: false });
        for (const t of again.targets) {
            expect(t.moved).toEqual({});
            expect(t.onNewest).toBe(t.values);
        }
    });

    it("counts API keys by id, and a key's use moves it to the newest", async () => {
        const counted = await resealAll({
            dryRun: true,
            keyName: "APIKEY_ENC_KEY",
        });
        expect(counted.targets).toEqual([]);
        expect(counted.fingerprints?.apiKeys).toEqual({ v1: 1 });

        const keys = new ApiKeysService({} as AuditService);
        expect((await keys.findUsableByToken(token))?.id).toBe(ids.apiKey);
        const row = await prisma.apiKey.findUniqueOrThrow({
            where: { id: ids.apiKey },
        });
        expect(row.tokenDigest).toBe(tokenDigest(token));
        expect(storedKeyId(row.tokenDigest)).toBe("v2");

        const after = await resealAll({
            dryRun: true,
            keyName: "APIKEY_ENC_KEY",
        });
        expect(after.fingerprints?.apiKeys).toEqual({ v2: 1 });
    });
});
