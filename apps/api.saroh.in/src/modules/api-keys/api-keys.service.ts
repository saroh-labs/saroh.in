import { randomBytes } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import type {
    ApiKeyKind,
    ApiKeyList,
    ApiKeyView,
    CreateApiKeyBody,
    CreatedApiKey,
    UpdateApiKeyBody,
} from "@saroh/api-contract";
import type { ApiKey, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { EncryptionKey } from "../../common/crypto";
import { keyedDigest, keyedDigests } from "../../common/crypto";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import type { BusinessAccess } from "../billing/catalogue-access.service";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { overLimit } from "../billing/over-limit.service";
import {
    MODULE_LOCKED,
    moduleLocked,
    planLimitReached,
} from "../billing/plan-limit-errors";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { OrgAction } from "../organizations/organization-actions";
import { ORG_ACTIONS } from "../organizations/organization-actions";
import {
    allows,
    authorize,
    OWNER_ONLY_ACTIONS,
} from "../organizations/organization-policy";
import { keyContextCache } from "./key-context.cache";

/** How long a rolled key keeps working beside its replacement. */
export const ROLL_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * What every publishable key may do, whatever was asked: read what the
 * business's website already shows (R4), exactly the capabilities the
 * storefront reads (U7) declare: the shop (`store:read`), the services
 * and their slots (`service:read`), posts (`site:read`) and the plans on
 * sale (`subscription:read`). The key is read-only whatever its scope:
 * `ApiKeyGuard` refuses any other method on the storefront.
 */
export const STOREFRONT_SCOPE: readonly OrgAction[] = [
    "store:read",
    "service:read",
    "site:read",
    "subscription:read",
];

/** Never on a key, whoever makes it (R7). */
// As an AI app's (`NEVER_FOR_AI`), plus managing the team: a key never holds
// a power only a person signed in to Settings uses.
const NEVER_ON_A_KEY: ReadonlySet<OrgAction> = new Set<OrgAction>([
    ...OWNER_ONLY_ACTIONS,
    "apikey:manage",
    "webhook:manage",
    "customer:sensitive",
    "member:invite",
    "member:remove",
    "member:role:update",
    "project:access:manage",
]);

const KNOWN_ACTIONS: ReadonlySet<string> = new Set(ORG_ACTIONS);

const TOKEN_PREFIX: Record<ApiKeyKind, "pk" | "sk"> = {
    PUBLISHABLE: "pk",
    SECRET: "sk",
};

/** The kill switch for making each kind (plan, Key Technical Decisions). */
const KIND_FLAG: Record<ApiKeyKind, FlagKey> = {
    PUBLISHABLE: FlagKey.API_STOREFRONT,
    SECRET: FlagKey.API_SECRET,
};

/** The pricing-catalogue row whose plan gate each kind passes. */
const KIND_ROW: Record<ApiKeyKind, string> = {
    PUBLISHABLE: "api-storefront",
    SECRET: "api-secret",
};

/** The catalogue row capping how many keys a business holds (`api.keys.max`). */
const KEYS_ROW = "api-keys";
const KEYS_LIMIT_KEY = "api.keys.max";

/**
 * A key as typed: `pk_` or `sk_`, the mode, then 32 random bytes in base62.
 * v1 makes only `live` keys; `test` is kept for test mode (plan, Deferred).
 */
export const TOKEN_PATTERN = /^(pk|sk)_(live|test)_[0-9A-Za-z]{43}$/;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BODY_LENGTH = 43; // 62^43 > 2^256: every 32 bytes fit.

/** Bytes as a fixed-length base62 string. */
export function base62(bytes: Buffer): string {
    let n = BigInt(`0x${bytes.toString("hex") || "0"}`);
    const base = BigInt(62);
    let out = "";
    while (n > BigInt(0)) {
        out = BASE62[Number(n % base)] + out;
        n /= base;
    }
    return out.padStart(BODY_LENGTH, "0");
}

/** A new token for `kind`. Shown once; only its digest is kept. */
export function mintToken(kind: ApiKeyKind): string {
    return `${TOKEN_PREFIX[kind]}_live_${base62(randomBytes(32))}`;
}

/** What a list shows of a token: the kind, the mode and 4 characters. */
export function displayPrefix(token: string): string {
    return token.slice(0, "sk_live_".length + 4);
}

export function apiKeyEncKey(): EncryptionKey {
    return {
        name: "APIKEY_ENC_KEY",
        value: env.APIKEY_ENC_KEY,
        protects: "API keys",
    };
}

/** A missing or malformed key is a 503 that names the variable, never its value. */
function withApiKeyKey<T>(run: (key: EncryptionKey) => T): T {
    const key = apiKeyEncKey();
    try {
        return run(key);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith(key.name)) {
            throw new ServiceUnavailableException(
                `API keys can't be made or checked yet: ${key.name} is not set correctly on the API.`,
            );
        }
        throw error;
    }
}

/**
 * The stored form of a token: a keyed digest under the ring's newest key, so
 * a copy of the table can't be walked back to a working key.
 */
export function tokenDigest(token: string): string {
    return withApiKeyKey((key) => keyedDigest(token, "apikey", key));
}

/** The token's digest under every key on the ring, newest first, for a lookup. */
export function tokenDigests(token: string): string[] {
    return withApiKeyKey((key) => keyedDigests(token, "apikey", key));
}

type KeyState = Pick<ApiKey, "revokedAt" | "expiresAt" | "graceUntil">;

/** Whether a key still opens anything at `now`: not revoked, expired or past its grace. */
export function isUsable(key: KeyState, now: Date = new Date()): boolean {
    const t = now.getTime();
    return (
        key.revokedAt === null &&
        (key.expiresAt === null || key.expiresAt.getTime() > t) &&
        (key.graceUntil === null || key.graceUntil.getTime() > t)
    );
}

/** Live (and in-grace) keys: what counts toward the cap. */
export const liveWhere = (now: Date): Prisma.ApiKeyWhereInput => ({
    revokedAt: null,
    AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: [{ graceUntil: null }, { graceUntil: { gt: now } }] },
    ],
});

/**
 * `requested` narrowed to what the creator may do now, minus what no key
 * may ever hold (`OWNER_ONLY_ACTIONS`, `apikey:manage`). Unknown names drop
 * out silently, as anything else outside the creator's reach does.
 */
export function clampScope(
    ctx: OrganizationContext,
    requested: readonly string[],
): OrgAction[] {
    const out = new Set<OrgAction>();
    for (const name of requested) {
        if (!KNOWN_ACTIONS.has(name)) continue;
        const action = name as OrgAction;
        if (NEVER_ON_A_KEY.has(action) || !allows(ctx, action)) continue;
        out.add(action);
    }
    return [...out];
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));

function toView(key: ApiKey): ApiKeyView {
    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    return {
        id: key.id,
        kind: key.kind,
        name: key.name,
        prefix: key.prefix,
        scope: key.scope,
        allowedOrigins: key.allowedOrigins,
        aiEnabled: key.aiEnabled,
        createdByUserId: key.createdByUserId,
        rolledFromId: key.rolledFromId,
        expiresAt: iso(key.expiresAt),
        revokedAt: iso(key.revokedAt),
        graceUntil: iso(key.graceUntil),
        lastUsedAt: iso(key.lastUsedAt),
        createdAt: key.createdAt.toISOString(),
    };
}

/**
 * Owner-managed storefront (publishable) and secret keys (plan
 * 2026-11-10-001, U5). Every call needs `apikey:manage` (owner only).
 * Making or rolling a kind needs its kill switch on (else 404), the plan's
 * row for it (else `MODULE_LOCKED`) and, to make one, room under
 * `api.keys.max` (else `PLAN_LIMIT_REACHED`); keys in grace count. The
 * token is returned once and never stored or logged: the row holds its
 * keyed digest and a display prefix.
 *
 * The plan gate reads the entitlement map (`CatalogueAccessService`), as
 * the public API's caps do (`rate-limits/caps.ts`), not `MeteringService`:
 * keys are paid-plan only, so a business the catalogue doesn't reach, or a
 * catalogue without the rows, is refused rather than waved through.
 */
@Injectable()
export class ApiKeysService {
    private readonly logger = new Logger(ApiKeysService.name);

    constructor(
        private readonly audit: AuditService,
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
    ) {}

    async list(ctx: OrganizationContext): Promise<ApiKeyList> {
        authorize(ctx, "apikey:manage");
        const rows = await prisma.apiKey.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        const makers = [...new Set(rows.map((k) => k.createdByUserId))];
        const [people, members, paused] = await Promise.all([
            prisma.user.findMany({
                where: { id: { in: makers } },
                select: { id: true, name: true },
            }),
            prisma.membership.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    userId: { in: makers },
                },
                select: { id: true, userId: true },
            }),
            overLimit.pausedNow(ctx.organizationId),
        ]);
        const nameOf = new Map(people.map((p) => [p.id, p.name]));
        // On the team and not paused: a key made by anyone else has stopped.
        const here = new Set(
            members
                .filter((m) => !paused?.memberIds.has(m.id))
                .map((m) => m.userId),
        );
        return {
            data: rows.map((k) => ({
                ...toView(k),
                madeBy: {
                    id: k.createdByUserId,
                    name: nameOf.get(k.createdByUserId) ?? null,
                    stillHere: here.has(k.createdByUserId),
                },
            })),
        };
    }

    /**
     * Edits a key: its name and what it can do. A secret key's scope is
     * clamped to the editor's own powers, as on create, so nobody gives a
     * key more than they hold; a publishable key stays read-only (its
     * fixed scope, no AI switch), only its websites change. The change
     * bites on the key's next call: the cached contexts are dropped. A
     * revoked, expired or replaced key is a 409.
     */
    async update(
        ctx: OrganizationContext,
        keyId: string,
        body: UpdateApiKeyBody,
        now: Date = new Date(),
    ): Promise<ApiKeyView> {
        authorize(ctx, "apikey:manage");
        const old = await this.find(ctx, keyId);
        await this.assertKindOpen(ctx.organizationId, old.kind, now);
        if (old.graceUntil !== null || !isUsable(old, now)) {
            throw new ConflictException(
                "This key can't be changed: it has been replaced, revoked or has expired.",
            );
        }
        const secret = old.kind === "SECRET";
        const data: Prisma.ApiKeyUpdateInput = {};
        if (body.name !== undefined && body.name !== old.name) {
            data.name = body.name;
        }
        if (secret && body.scope !== undefined) {
            const scope = clampScope(ctx, body.scope);
            if (scope.length === 0) {
                throw new BadRequestException(
                    "Choose at least one thing this key may do.",
                );
            }
            if (!sameSet(scope, old.scope)) data.scope = scope;
        }
        if (
            secret &&
            body.aiEnabled !== undefined &&
            body.aiEnabled !== old.aiEnabled
        ) {
            data.aiEnabled = body.aiEnabled;
        }
        if (
            !secret &&
            body.allowedOrigins !== undefined &&
            !sameSet(body.allowedOrigins, old.allowedOrigins)
        ) {
            if (body.allowedOrigins.length === 0) {
                throw new BadRequestException("Add the website it works on.");
            }
            data.allowedOrigins = body.allowedOrigins;
        }
        if (Object.keys(data).length === 0) return toView(old);
        const key = await prisma.apiKey.update({
            where: { id: old.id },
            data,
        });
        keyContextCache.forgetOrganization(ctx.organizationId);
        const nameOnly = Object.keys(data).length === 1 && "name" in data;
        await this.record(
            ctx,
            nameOnly ? AuditAction.ApiKeyRenamed : AuditAction.ApiKeyUpdated,
            key,
            nameOnly
                ? { previousName: old.name }
                : {
                      previousName: old.name,
                      scopeBefore: old.scope.join(" "),
                      scopeAfter: key.scope.join(" "),
                      originsBefore: old.allowedOrigins.join(" "),
                      originsAfter: key.allowedOrigins.join(" "),
                      aiBefore: String(old.aiEnabled),
                      aiAfter: String(key.aiEnabled),
                  },
        );
        return toView(key);
    }

    async create(
        ctx: OrganizationContext,
        body: CreateApiKeyBody,
        now: Date = new Date(),
    ): Promise<CreatedApiKey> {
        authorize(ctx, "apikey:manage");
        const access = await this.assertKindOpen(
            ctx.organizationId,
            body.kind,
            now,
        );

        const secret = body.kind === "SECRET";
        const scope = secret
            ? clampScope(ctx, body.scope ?? [])
            : [...STOREFRONT_SCOPE];
        if (scope.length === 0) {
            throw new BadRequestException(
                "Choose at least one thing this key may do.",
            );
        }
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
        if (expiresAt && expiresAt.getTime() <= now.getTime()) {
            throw new BadRequestException("The expiry must be in the future.");
        }
        const cap = this.keyCap(access);
        const edition = await this.editionOf(ctx);

        const token = mintToken(body.kind);
        const key = await prisma.$transaction(async (tx) => {
            if (cap) {
                // One business's creates queue here, so two at once can't
                // both fit the last place.
                const lock = `api-keys:${ctx.organizationId}`;
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
                const used = await tx.apiKey.count({
                    where: {
                        organizationId: ctx.organizationId,
                        ...liveWhere(now),
                    },
                });
                if (used + 1 > cap.limit) {
                    throw planLimitReached(
                        cap.row,
                        KEYS_LIMIT_KEY,
                        cap.limit,
                        used,
                    );
                }
            }
            return tx.apiKey.create({
                data: {
                    organizationId: ctx.organizationId,
                    createdByUserId: ctx.userId,
                    kind: body.kind,
                    edition,
                    name: body.name,
                    prefix: displayPrefix(token),
                    tokenDigest: tokenDigest(token),
                    scope,
                    allowedOrigins: secret ? [] : (body.allowedOrigins ?? []),
                    aiEnabled: secret && body.aiEnabled === true,
                    expiresAt,
                },
            });
        });
        await this.record(ctx, AuditAction.ApiKeyCreated, key);
        return { key: toView(key), token };
    }

    /**
     * A new token for a key: the new key copies its scope (re-clamped to the
     * rolling owner, who becomes its creator), origins, AI switch and expiry;
     * the old one works for {@link ROLL_GRACE_MS} more. A key already in
     * grace, revoked or expired is a 409. No cap check: a leaked key must
     * always be replaceable, and the old one leaves within a day.
     */
    async roll(
        ctx: OrganizationContext,
        keyId: string,
        now: Date = new Date(),
    ): Promise<CreatedApiKey> {
        authorize(ctx, "apikey:manage");
        const old = await this.find(ctx, keyId);
        await this.assertKindOpen(ctx.organizationId, old.kind, now);
        if (old.graceUntil !== null || !isUsable(old, now)) {
            throw new ConflictException(
                "This key can't be rolled: it has been rolled already, revoked or has expired.",
            );
        }
        const scope =
            old.kind === "SECRET"
                ? clampScope(ctx, old.scope)
                : [...STOREFRONT_SCOPE];
        const token = mintToken(old.kind);
        const graceUntil = new Date(now.getTime() + ROLL_GRACE_MS);
        const key = await prisma.$transaction(async (tx) => {
            // Only one roll wins: the old key must still be out of grace.
            const claimed = await tx.apiKey.updateMany({
                where: { id: old.id, graceUntil: null, revokedAt: null },
                data: { graceUntil },
            });
            if (claimed.count !== 1) {
                throw new ConflictException(
                    "This key has just been rolled or revoked.",
                );
            }
            return tx.apiKey.create({
                data: {
                    organizationId: old.organizationId,
                    createdByUserId: ctx.userId,
                    kind: old.kind,
                    edition: old.edition,
                    name: old.name,
                    prefix: displayPrefix(token),
                    tokenDigest: tokenDigest(token),
                    scope,
                    allowedOrigins: old.allowedOrigins,
                    aiEnabled: old.aiEnabled,
                    expiresAt: old.expiresAt,
                    rolledFromId: old.id,
                },
            });
        });
        keyContextCache.forgetOrganization(ctx.organizationId);
        await this.record(ctx, AuditAction.ApiKeyRolled, key, {
            rolledFromId: old.id,
            graceUntil: graceUntil.toISOString(),
        });
        return { key: toView(key), token };
    }

    /** Ends a key at once, in grace or not. Revoking a revoked key changes nothing. */
    async revoke(
        ctx: OrganizationContext,
        keyId: string,
        now: Date = new Date(),
    ): Promise<ApiKeyView> {
        authorize(ctx, "apikey:manage");
        const old = await this.find(ctx, keyId);
        if (old.revokedAt) return toView(old);
        const key = await prisma.apiKey.update({
            where: { id: old.id },
            data: { revokedAt: now },
        });
        keyContextCache.forgetOrganization(ctx.organizationId);
        await this.record(ctx, AuditAction.ApiKeyRevoked, key);
        return toView(key);
    }

    /**
     * The key a presented token belongs to, if it still opens anything at
     * `now`; null otherwise (U6 answers 401). A token not shaped like a key
     * is never digested or looked up.
     */
    async findUsableByToken(
        token: string,
        now: Date = new Date(),
    ): Promise<ApiKey | null> {
        if (!TOKEN_PATTERN.test(token)) return null;
        const digests = tokenDigests(token);
        const key = await prisma.apiKey.findFirst({
            where: { tokenDigest: { in: digests } },
        });
        if (!key || !isUsable(key, now)) return null;
        // Made under an older key: move it to the newest, since the token is
        // only ever seen here. The context cache is keyed by the newest
        // digest already, so nothing cached goes stale.
        const [newest] = digests;
        if (newest && key.tokenDigest !== newest) {
            try {
                await prisma.apiKey.updateMany({
                    where: { id: key.id, tokenDigest: key.tokenDigest },
                    data: { tokenDigest: newest },
                });
            } catch (error) {
                this.logger.warn(
                    `api_key_digest_upgrade_failed: ${error instanceof Error ? error.name : "error"}`,
                );
            }
        }
        return key;
    }

    private async find(ctx: OrganizationContext, keyId: string) {
        const key = await prisma.apiKey.findFirst({
            where: { id: keyId, organizationId: ctx.organizationId },
        });
        if (!key) throw new NotFoundException("Key not found");
        return key;
    }

    /** The kind's kill switch (404 when off) and the plan's row for it. */
    private async assertKindOpen(
        organizationId: string,
        kind: ApiKeyKind,
        now: Date,
    ): Promise<BusinessAccess> {
        if (!(await this.flags.isEnabled(KIND_FLAG[kind], organizationId))) {
            throw new NotFoundException();
        }
        const a = await this.access.resolve(organizationId, now);
        // Absent (a catalogue without the row), off or a zero cap: refused.
        if (!a.entitlements[KIND_ROW[kind]]) {
            throw this.locked(a, KIND_ROW[kind]);
        }
        return a;
    }

    /** The cap on keys, or null when the plan sets none. */
    private keyCap(a: BusinessAccess) {
        const value = a.entitlements[KEYS_ROW];
        if (value === true) return null;
        if (typeof value !== "number" || value <= 0) {
            throw this.locked(a, KEYS_ROW);
        }
        const row =
            a.source === "catalogue"
                ? a.modules.find((m) => m.moduleId === KEYS_ROW)
                : undefined;
        if (!row) throw this.locked(a, KEYS_ROW);
        return { limit: value, row };
    }

    private locked(a: BusinessAccess, moduleId: string): ForbiddenException {
        const row =
            a.source === "catalogue"
                ? a.modules.find((m) => m.moduleId === moduleId)
                : undefined;
        if (row) return moduleLocked(row);
        return new ForbiddenException({
            message: "API keys aren't in your plan.",
            details: {
                code: MODULE_LOCKED,
                moduleId,
                plan: null,
                upgradeTo: null,
            },
        });
    }

    private async editionOf(ctx: OrganizationContext) {
        if (ctx.edition) return ctx.edition;
        const org = await prisma.organization.findUniqueOrThrow({
            where: { id: ctx.organizationId },
            select: { edition: true },
        });
        return org.edition;
    }

    /** Never the token or its digest: which key, its kind and prefix. */
    private record(
        ctx: OrganizationContext,
        action: AuditAction,
        key: ApiKey,
        extra: Record<string, string> = {},
    ): Promise<void> {
        return this.audit.record({
            action,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "api-key",
            targetId: key.id,
            outcome: AuditOutcome.Success,
            metadata: {
                kind: key.kind,
                name: key.name,
                prefix: key.prefix,
                ...extra,
            },
            actorRoleKey: ctx.roleKey,
        });
    }
}
