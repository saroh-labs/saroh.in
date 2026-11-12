import { Prisma, prisma } from "@saroh/database";

import type { EncryptedSecret, EncryptionKey } from "../common/crypto";
import { newestKeyId, resealWithKey, storedKeyId } from "../common/crypto";
import { staffPiiKey } from "../modules/admin/staff-profile";
import { apiKeyEncKey, isUsable } from "../modules/api-keys/api-keys.service";
import { MESSAGE_SEND_TYPE } from "../modules/communications/message-send.handler";
import { messagingKey } from "../modules/messaging/messaging-records";
import { webhookSecretKey } from "../modules/outbound-webhooks/endpoints.service";
import { paymentsKey } from "../modules/payments/crypto";

/**
 * Move every sealed value onto its ring's newest key (DEC-214), so an old
 * key can be taken off the ring. Runbook: `KEY_ROTATION.md`.
 *
 * Each row is written only if it still holds what was read (a compare on
 * the old ciphertext), so a value its owner changed meanwhile is never
 * overwritten; it is counted and a second run picks it up. `updatedAt` is
 * kept: nothing a person did changed.
 */

const BATCH = 200;
type Slot = EncryptedSecret | null;

interface Target<R extends { id: string }> {
    /** What it prints: a table, never a value. */
    label: string;
    key: () => EncryptionKey;
    page: (after: string | undefined) => Promise<R[]>;
    values: (row: R) => Slot[];
    /** Write `next`; false when the row changed since it was read. */
    write: (row: R, next: Slot[]) => Promise<boolean>;
}

const after = (cursor: string | undefined) =>
    cursor ? { id: { gt: cursor } } : {};
/** Every row, `BATCH` at a time, in id order. */
async function* batches<R extends { id: string }>(
    load: (cursor: string | undefined) => Promise<R[]>,
): AsyncGenerator<R[]> {
    let cursor: string | undefined;
    for (;;) {
        const rows = await load(cursor);
        if (rows.length === 0) return;
        yield rows;
        cursor = rows[rows.length - 1].id;
    }
}
const page = { take: BATCH, orderBy: { id: "asc" as const } };
const sealed = (
    ciphertext: string | null,
    iv: string | null,
    authTag: string | null,
): Slot => (ciphertext && iv && authTag ? { ciphertext, iv, authTag } : null);
/** The runner hands a write every value it read, re-sealed or not. */
const must = (v: Slot): EncryptedSecret => {
    if (!v) throw new Error("keys-reseal: a sealed value went missing");
    return v;
};
const asSealed = (v: unknown): Slot =>
    v && typeof v === "object" && "ciphertext" in v
        ? (v as EncryptedSecret)
        : null;

/** Provider credentials: one sealed blob, the same columns on both tables. */
function credentials(
    label: string,
    table: "merchantPaymentProvider" | "communicationProvider",
): Target<{
    id: string;
    encryptedCredentials: string;
    credentialsIv: string;
    credentialsAuthTag: string;
    updatedAt: Date;
}> {
    const select = {
        id: true,
        encryptedCredentials: true,
        credentialsIv: true,
        credentialsAuthTag: true,
        updatedAt: true,
    };
    // Both delegates take the same arguments; Prisma can't name the union.
    const db = prisma[table] as unknown as typeof prisma.communicationProvider;
    return {
        label,
        key: paymentsKey,
        page: (cursor) =>
            db.findMany({ ...page, where: after(cursor), select }),
        values: (r) => [
            sealed(
                r.encryptedCredentials,
                r.credentialsIv,
                r.credentialsAuthTag,
            ),
        ],
        write: async (r, [next]) =>
            (
                await db.updateMany({
                    where: {
                        id: r.id,
                        encryptedCredentials: r.encryptedCredentials,
                    },
                    data: {
                        encryptedCredentials: must(next).ciphertext,
                        credentialsIv: must(next).iv,
                        credentialsAuthTag: must(next).authTag,
                        updatedAt: r.updatedAt,
                    },
                })
            ).count === 1,
    };
}

const OPEN_JOB = ["PENDING", "PROCESSING"];
type AnyTarget = Target<{ id: string }>;
const target = <R extends { id: string }>(t: Target<R>) =>
    t as unknown as AnyTarget;

export const RESEAL_TARGETS: AnyTarget[] = [
    target(credentials("payment connections", "merchantPaymentProvider")),
    target(credentials("messaging connections", "communicationProvider")),
    target({
        // A queued send's pay link and "How to pay us" lines.
        label: "queued message sends",
        key: paymentsKey,
        page: (cursor) =>
            prisma.job.findMany({
                ...page,
                where: {
                    ...after(cursor),
                    type: MESSAGE_SEND_TYPE,
                    status: { in: OPEN_JOB },
                },
                select: { id: true, payload: true, updatedAt: true },
            }),
        values: (r) => {
            const p = r.payload as Record<string, unknown>;
            return [asSealed(p.link), asSealed(p.howToPay)];
        },
        write: async (r, [link, howToPay]) => {
            const p = r.payload as Record<string, unknown>;
            const payload = {
                ...p,
                ...(link ? { link } : {}),
                ...(howToPay ? { howToPay } : {}),
            } as Prisma.InputJsonValue;
            const done = await prisma.job.updateMany({
                where: {
                    id: r.id,
                    status: { in: OPEN_JOB },
                    payload: { equals: r.payload as Prisma.InputJsonValue },
                },
                data: { payload, updatedAt: r.updatedAt },
            });
            return done.count === 1;
        },
    }),
    target({
        label: "staff tax ids",
        key: staffPiiKey,
        page: (cursor) =>
            prisma.staffProfile.findMany({
                ...page,
                where: { ...after(cursor), taxIdCiphertext: { not: null } },
                select: {
                    id: true,
                    taxIdCiphertext: true,
                    taxIdIv: true,
                    taxIdAuthTag: true,
                    updatedAt: true,
                },
            }),
        values: (r) => [sealed(r.taxIdCiphertext, r.taxIdIv, r.taxIdAuthTag)],
        write: async (r, [next]) =>
            (
                await prisma.staffProfile.updateMany({
                    where: { id: r.id, taxIdCiphertext: r.taxIdCiphertext },
                    data: {
                        taxIdCiphertext: must(next).ciphertext,
                        taxIdIv: must(next).iv,
                        taxIdAuthTag: must(next).authTag,
                        updatedAt: r.updatedAt,
                    },
                })
            ).count === 1,
    }),
    target({
        label: "queued WhatsApp messages",
        key: messagingKey,
        page: (cursor) =>
            prisma.messagingMessage.findMany({
                ...page,
                where: {
                    ...after(cursor),
                    sealedRequest: { not: Prisma.DbNull },
                },
                select: { id: true, sealedRequest: true, updatedAt: true },
            }),
        values: (r) => [asSealed(r.sealedRequest)],
        write: async (r, [next]) =>
            (
                await prisma.messagingMessage.updateMany({
                    where: {
                        id: r.id,
                        sealedRequest: {
                            equals: r.sealedRequest as Prisma.InputJsonValue,
                        },
                    },
                    data: {
                        sealedRequest: { ...must(next) },
                        updatedAt: r.updatedAt,
                    },
                })
            ).count === 1,
    }),
    target({
        label: "webhook signing secrets",
        key: webhookSecretKey,
        page: (cursor) =>
            prisma.webhookEndpoint.findMany({
                ...page,
                where: after(cursor),
                select: {
                    id: true,
                    secretCiphertext: true,
                    secretIv: true,
                    secretAuthTag: true,
                    previousSecretCiphertext: true,
                    previousSecretIv: true,
                    previousSecretAuthTag: true,
                    updatedAt: true,
                },
            }),
        values: (r) => [
            sealed(r.secretCiphertext, r.secretIv, r.secretAuthTag),
            sealed(
                r.previousSecretCiphertext,
                r.previousSecretIv,
                r.previousSecretAuthTag,
            ),
        ],
        write: async (r, [now, previous]) =>
            (
                await prisma.webhookEndpoint.updateMany({
                    where: {
                        id: r.id,
                        secretCiphertext: r.secretCiphertext,
                        previousSecretCiphertext: r.previousSecretCiphertext,
                    },
                    data: {
                        secretCiphertext: must(now).ciphertext,
                        secretIv: must(now).iv,
                        secretAuthTag: must(now).authTag,
                        ...(previous
                            ? {
                                  previousSecretCiphertext: previous.ciphertext,
                                  previousSecretIv: previous.iv,
                                  previousSecretAuthTag: previous.authTag,
                              }
                            : {}),
                        updatedAt: r.updatedAt,
                    },
                })
            ).count === 1,
    }),
];

export interface TargetReport {
    label: string;
    keyName: string;
    /** The ring's newest id; absent when the key can't be read. */
    newest?: string;
    values: number;
    onNewest: number;
    /** Moved (or, in a dry run, would move) from each older id. */
    moved: Record<string, number>;
    changedMeanwhile: number;
    cannotOpen: number;
    /** The key's own error (names the variable and an id, never a value). */
    unusable?: string;
}

export interface ResealReport {
    dryRun: boolean;
    targets: TargetReport[];
    /** API keys still usable, and live storefront tokens, by key id. */
    fingerprints?: {
        newest?: string;
        unusable?: string;
        apiKeys: Record<string, number>;
        storefrontTokens: Record<string, number>;
    };
}

const bump = (m: Record<string, number>, id: string) => {
    m[id] = (m[id] ?? 0) + 1;
};
const messageOf = (e: unknown) => (e instanceof Error ? e.message : "error");

async function resealTarget<R extends { id: string }>(
    t: Target<R>,
    dryRun: boolean,
): Promise<TargetReport> {
    const key = t.key();
    const report: TargetReport = {
        label: t.label,
        keyName: key.name,
        values: 0,
        onNewest: 0,
        moved: {},
        changedMeanwhile: 0,
        cannotOpen: 0,
    };
    try {
        report.newest = newestKeyId(key);
    } catch (error) {
        // No key and nothing sealed (a module not used here) is fine.
        if ((await t.page(undefined)).length > 0) {
            report.unusable = messageOf(error);
        }
        return report;
    }
    for await (const rows of batches(t.page)) {
        for (const row of rows) {
            const before = t.values(row);
            let next: Slot[];
            try {
                next = before.map((v) => v && resealWithKey(v, key));
            } catch {
                report.cannotOpen += 1;
                continue;
            }
            before.forEach((v, i) => {
                if (!v) return;
                report.values += 1;
                if (next[i]) bump(report.moved, storedKeyId(v.ciphertext));
                else report.onNewest += 1;
            });
            if (dryRun || next.every((v) => !v)) continue;
            const wrote = await t.write(
                row,
                before.map((v, i) => next[i] ?? v),
            );
            if (!wrote) report.changedMeanwhile += 1;
        }
    }
    return report;
}

/** API keys can't be re-fingerprinted (the token isn't kept): count them. */
async function countFingerprints(
    now: Date,
): Promise<NonNullable<ResealReport["fingerprints"]>> {
    const out: NonNullable<ResealReport["fingerprints"]> = {
        apiKeys: {},
        storefrontTokens: {},
    };
    try {
        out.newest = newestKeyId(apiKeyEncKey());
    } catch (error) {
        out.unusable = messageOf(error);
    }
    const keys = batches((cursor) =>
        prisma.apiKey.findMany({
            ...page,
            where: after(cursor),
            select: {
                id: true,
                tokenDigest: true,
                revokedAt: true,
                expiresAt: true,
                graceUntil: true,
            },
        }),
    );
    for await (const rows of keys) {
        for (const r of rows) {
            if (isUsable(r, now)) bump(out.apiKeys, storedKeyId(r.tokenDigest));
        }
    }
    const tokens = batches((cursor) =>
        prisma.storefrontToken.findMany({
            ...page,
            where: { ...after(cursor), expiresAt: { gt: now } },
            select: { id: true, tokenDigest: true },
        }),
    );
    for await (const rows of tokens) {
        for (const r of rows) {
            bump(out.storefrontTokens, storedKeyId(r.tokenDigest));
        }
    }
    return out;
}

/**
 * Re-seal every value onto its ring's newest key, in batches. `keyName`
 * keeps the run to one variable. Safe to run again and to stop partway:
 * a value already on the newest key is left alone.
 */
export async function resealAll(opts: {
    dryRun: boolean;
    keyName?: string;
    now?: Date;
}): Promise<ResealReport> {
    const report: ResealReport = { dryRun: opts.dryRun, targets: [] };
    for (const t of RESEAL_TARGETS) {
        if (opts.keyName && t.key().name !== opts.keyName) continue;
        report.targets.push(await resealTarget(t, opts.dryRun));
    }
    if (!opts.keyName || opts.keyName === apiKeyEncKey().name) {
        report.fingerprints = await countFingerprints(opts.now ?? new Date());
    }
    return report;
}

/** The variables a run can be kept to. */
export const RESEAL_KEY_NAMES = [
    ...new Set([
        ...RESEAL_TARGETS.map((t) => t.key().name),
        apiKeyEncKey().name,
    ]),
];

const byId = (m: Record<string, number>) =>
    Object.entries(m)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([id, n]) => `${id}: ${n}`)
        .join(", ") || "none";

/** Counts and key ids only. */
export function formatReport(r: ResealReport): string[] {
    const lines = r.targets.map((t) => {
        const head = `${t.label} (${t.keyName}`;
        if (t.unusable)
            return `${head}): key not usable, skipped. ${t.unusable}`;
        if (!t.newest) return `${head}): no key set and nothing sealed`;
        const moved = Object.values(t.moved).reduce((a, b) => a + b, 0);
        return `${head}, newest ${t.newest}): ${t.values} values, ${t.onNewest} already on ${t.newest}, ${r.dryRun ? "would move" : "moved"} ${moved} (${byId(t.moved)}), changed meanwhile ${t.changedMeanwhile}, cannot open ${t.cannotOpen}`;
    });
    const f = r.fingerprints;
    if (f) {
        lines.push(
            `API key fingerprints (APIKEY_ENC_KEY${f.newest ? `, newest ${f.newest}` : ""}): usable keys by id: ${byId(f.apiKeys)}; live visitor tokens by id: ${byId(f.storefrontTokens)}. These move only when used; an old id can go when it shows no keys you need.`,
        );
    }
    return [...(r.dryRun ? ["dry run, nothing written."] : []), ...lines];
}

/** Exit 1 when anything is left that a removed key would break. */
export function failed(r: ResealReport): boolean {
    return r.targets.some(
        (t) => !!t.unusable || t.cannotOpen > 0 || t.changedMeanwhile > 0,
    );
}
