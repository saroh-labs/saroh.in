import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ErrorCode } from "@saroh/api-contract";
import type { ApiKey } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { Request, Response } from "express";

import { hashClientIp, visitorAddress } from "../../common/client-ip";
import { publicApiSurfaceOf, storefrontKeyOf } from "../../common/cors";
import { assertEditionMatchesAddress } from "../../common/edition-address";
import { lifecycleWriteClassOf } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { OrgAction } from "../organizations/organization-actions";
import { OrganizationContextService } from "../organizations/organization-context.service";
import {
    assertWorkspaceWrite,
    isReadOnlyMethod,
} from "../organizations/organization-lifecycle.gate";
import { CapsService } from "../rate-limits/caps";
import { LimitsService } from "../rate-limits/limits.service";
import {
    ApiKeysService,
    isUsable,
    TOKEN_PATTERN,
    tokenDigest,
} from "./api-keys.service";
import type { KeyContext } from "./key-context.cache";
import { keyContextCache } from "./key-context.cache";

/** `lastUsedAt` is written at most this often per key: a list shows "used today", not every call. */
export const TOUCH_EVERY_MS = 60_000;

/**
 * shortcut: one visitor may use this share of the business's storefront cap,
 * so one page left polling can't spend everyone's. A catalogue row of its
 * own replaces it if businesses need to tune it.
 */
export const VISITOR_SHARE = 4;

export interface KeyedRequest extends Request {
    organizationContext?: OrganizationContext;
    /** The key the request came with, for routes that need its origins or id. */
    apiKey?: ApiKey;
}

function refusal(status: number, code: ErrorCode, message: string) {
    return new HttpException({ error: { code, message } }, status);
}

const badKey = () =>
    refusal(
        HttpStatus.UNAUTHORIZED,
        "unauthorized",
        "This API key isn't valid. It may have been revoked, rolled or expired.",
    );

/**
 * The front door for API keys (plan 2026-11-10-001, U6). A secret key comes
 * as `Authorization: Bearer sk_…` on `/v1`; a publishable key sits in the
 * path, `/v1/storefront/{pk_…}/…`. The session cookie is never read.
 *
 * The business comes only from the key. The request gets the standard
 * {@link OrganizationContext}: the key's creator, resolved live, with
 * `actions` = the key's scope ∩ what the creator may do now. So `authorize()`
 * and row-level security (`OrgRlsInterceptor`) are the enforcement, as for
 * the workspace.
 *
 * Refusals: no key, or one revoked, expired or past its grace, 401; a
 * creator who no longer holds the business, 401 `key_owner_inactive`; the
 * wrong kind of key for the surface, 403; a storefront call from an origin
 * not on the key's list, 403; the surface's kill switch off or the key's
 * edition not served at this address, 404; over the cap, 429.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
    private readonly logger = new Logger(ApiKeyGuard.name);
    private readonly touched = new Map<string, number>();

    constructor(
        private readonly keys: ApiKeysService,
        private readonly organizations: OrganizationContextService,
        private readonly caps: CapsService,
        private readonly limits: LimitsService,
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
        @Optional() private readonly reflector: Reflector = new Reflector(),
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const req = http.getRequest<KeyedRequest>();
        const res = http.getResponse<Response>();
        const path = req.path;
        const surface =
            publicApiSurfaceOf(path) === "storefront" ? "storefront" : "secret";

        const token =
            surface === "storefront"
                ? storefrontKeyOf(path)
                : bearerOf(req.headers.authorization);
        const now = new Date();
        const found = token ? await this.contextFor(token, now) : null;
        if (!found) throw badKey();
        const { key, context: ctx } = found;

        if (
            key.kind !== (surface === "storefront" ? "PUBLISHABLE" : "SECRET")
        ) {
            throw refusal(
                HttpStatus.FORBIDDEN,
                "forbidden",
                surface === "storefront"
                    ? "Use a publishable key here."
                    : "A publishable key only reads what the business's website shows. Use a secret key here.",
            );
        }
        const flag =
            surface === "storefront"
                ? FlagKey.API_STOREFRONT
                : FlagKey.API_SECRET;
        if (!(await this.flags.isEnabled(flag, key.organizationId))) {
            throw new NotFoundException();
        }
        try {
            assertEditionMatchesAddress(key.edition, req.headers.host);
        } catch {
            throw new NotFoundException();
        }
        if (surface === "storefront") {
            // A publishable key only reads (U7); a visitor's writes take a
            // storefront token under `/v1/storefront/write/…`.
            if (!["GET", "HEAD"].includes(req.method.toUpperCase())) {
                throw refusal(
                    HttpStatus.FORBIDDEN,
                    "forbidden",
                    "A publishable key only reads. Send a visitor's bookings and orders with a visitor token from the business's server.",
                );
            }
            const origin = req.headers.origin;
            // No Origin: not a browser's cross-site call (a merchant's server).
            if (origin && !key.allowedOrigins.includes(origin)) {
                throw refusal(
                    HttpStatus.FORBIDDEN,
                    "forbidden",
                    "This website isn't on the key's list of allowed origins.",
                );
            }
        }

        await this.limit(req, res, surface, key);

        if (!isReadOnlyMethod(req.method)) {
            await assertWorkspaceWrite(
                key.organizationId,
                lifecycleWriteClassOf(this.reflector, context),
            );
        }

        req.organizationContext = ctx;
        req.apiKey = key;
        this.touch(key.id, now);
        return true;
    }

    /**
     * The key a token opens and the context it acts with, or null. Kept for
     * a few seconds (`key-context.cache.ts`); usability is checked again on
     * every call, so an expiry or a grace's end bites on time.
     */
    async contextFor(
        token: string,
        now: Date = new Date(),
    ): Promise<KeyContext | null> {
        if (!TOKEN_PATTERN.test(token)) return null;
        const found = await keyContextCache.get(
            tokenDigest(token),
            () => this.load(token, now),
            now.getTime(),
        );
        return found && isUsable(found.key, now) ? found : null;
    }

    /** The origins a publishable key answers in a browser; none when it opens nothing. */
    async allowedOrigins(token: string): Promise<readonly string[]> {
        const found = await this.contextFor(token);
        return found?.key.kind === "PUBLISHABLE"
            ? found.key.allowedOrigins
            : [];
    }

    private async load(token: string, now: Date): Promise<KeyContext | null> {
        const key = await this.keys.findUsableByToken(token, now);
        if (!key) return null;
        let creator: OrganizationContext;
        try {
            creator = await this.organizations.resolve(
                key.createdByUserId,
                key.organizationId,
            );
        } catch (error) {
            // Left, removed, paused, or the business closed to its people.
            if (error instanceof HttpException) {
                throw refusal(
                    HttpStatus.UNAUTHORIZED,
                    "key_owner_inactive",
                    "The person who made this key no longer has access to the business. An owner can make a new key.",
                );
            }
            throw error;
        }
        const live = creator.actions ?? new Set<OrgAction>();
        const actions = new Set(
            key.scope.filter((a): a is OrgAction => live.has(a as OrgAction)),
        );
        return { key, context: { ...creator, actions } };
    }

    /** Per visitor (storefront), per key, then per business, at the plan's cap. */
    private async limit(
        req: KeyedRequest,
        res: Response,
        surface: "storefront" | "secret",
        key: ApiKey,
    ): Promise<void> {
        const cap = await this.caps.rpm(key.organizationId, surface);
        if (surface === "storefront") {
            const visitor = hashClientIp(visitorAddress(req, env.TRUST_PROXY));
            if (visitor) {
                await this.limits.enforce(
                    res,
                    surface,
                    `visitor:${key.organizationId}:${visitor}`,
                    cap <= 0 ? 0 : Math.max(1, Math.floor(cap / VISITOR_SHARE)),
                );
            }
        }
        await this.limits.enforce(res, surface, `key:${key.id}`, cap);
        await this.limits.enforce(
            res,
            surface,
            `org:${key.organizationId}`,
            cap,
        );
    }

    /** Fire and forget, at most once a {@link TOUCH_EVERY_MS} per key on this replica. */
    private touch(keyId: string, now: Date): void {
        const t = now.getTime();
        const last = this.touched.get(keyId);
        if (last !== undefined && t - last < TOUCH_EVERY_MS) return;
        if (this.touched.size >= 10_000) this.touched.clear();
        this.touched.set(keyId, t);
        void prisma.apiKey
            .updateMany({
                where: {
                    id: keyId,
                    OR: [
                        { lastUsedAt: null },
                        { lastUsedAt: { lt: new Date(t - TOUCH_EVERY_MS) } },
                    ],
                },
                data: { lastUsedAt: now },
            })
            .catch((error: unknown) => {
                this.logger.warn(
                    `api_key_touch_failed: ${error instanceof Error ? error.name : "unknown"}`,
                );
            });
    }
}

/** The token in `Authorization: Bearer …`, or undefined. */
function bearerOf(header: string | undefined): string | undefined {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
    return match?.[1];
}
