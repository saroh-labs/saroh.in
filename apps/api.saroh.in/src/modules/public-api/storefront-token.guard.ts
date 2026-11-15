import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { ErrorCode } from "@saroh/api-contract";
import type { StorefrontToken } from "@saroh/database";
import type { Response } from "express";

import { hashClientIp, visitorAddress } from "../../common/client-ip";
import { assertEditionMatchesAddress } from "../../common/edition-address";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { VISITOR_SHARE } from "../api-keys/api-key.guard";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { OrgAction } from "../organizations/organization-actions";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { CapsService } from "../rate-limits/caps";
import { LimitsService } from "../rate-limits/limits.service";
import { StorefrontTokensService } from "./storefront-tokens.service";

export interface TokenRequest {
    method: string;
    path: string;
    headers: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
    organizationContext?: OrganizationContext;
    storefrontToken?: StorefrontToken;
    /** The visitor's hashed address, for the services' own limits. */
    visitorHash?: string;
}

/** The one action a token carries, from its key and its key's creator. */
const TOKEN_ACTIONS: readonly OrgAction[] = ["storefront:mint"];

function refusal(status: number, code: ErrorCode, message: string) {
    return new HttpException({ error: { code, message } }, status);
}

/**
 * The front door for a visitor's writes, `/v1/storefront/write/…` with
 * `Authorization: Bearer st_…` (plan 2026-11-10-001, U7). The business
 * comes only from the token. The context is the minting secret key's
 * creator, resolved live, with `actions` = `storefront:mint` when both the
 * key's scope and the creator still hold it, so `authorize()` and RLS stay
 * the enforcement as on every keyed route.
 *
 * Refusals: no token, an unknown or expired one, or one whose key was
 * revoked, 401; a creator who no longer holds the business, 401
 * `key_owner_inactive`; an Origin outside the token's list, 403; the
 * storefront's kill switch off or the wrong edition's address, 404; over
 * the cap per token, per visitor or per business, 429.
 *
 * shortcut: the creator is resolved on every write, not kept like a key's
 * context; writes are rare beside reads. Cache it if they aren't.
 */
@Injectable()
export class StorefrontTokenGuard implements CanActivate {
    constructor(
        private readonly tokens: StorefrontTokensService,
        private readonly organizations: OrganizationContextService,
        private readonly caps: CapsService,
        private readonly limits: LimitsService,
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const req = http.getRequest<TokenRequest>();
        const res = http.getResponse<Response>();
        const header = req.headers.authorization;
        const bearer = /^Bearer\s+(\S+)\s*$/i.exec(
            typeof header === "string" ? header : "",
        )?.[1];
        const token = bearer ? await this.tokens.find(bearer) : null;
        if (!token) {
            throw refusal(
                HttpStatus.UNAUTHORIZED,
                "unauthorized",
                "This visitor token isn't valid. It may have expired: ask the business's server for a new one.",
            );
        }
        const organizationId = token.organizationId;
        if (
            !(await this.flags.isEnabled(
                FlagKey.API_STOREFRONT,
                organizationId,
            ))
        ) {
            throw new NotFoundException();
        }
        try {
            assertEditionMatchesAddress(
                token.apiKey.edition,
                req.headers.host as string | undefined,
            );
        } catch {
            throw new NotFoundException();
        }
        const origin = req.headers.origin;
        // No Origin: not a browser's cross-site call.
        if (
            typeof origin === "string" &&
            !token.allowedOrigins.includes(origin)
        ) {
            throw refusal(
                HttpStatus.FORBIDDEN,
                "forbidden",
                "This website isn't on the token's list of allowed origins.",
            );
        }

        const cap = await this.caps.rpm(organizationId, "storefront");
        const share =
            cap <= 0 ? 0 : Math.max(1, Math.floor(cap / VISITOR_SHARE));
        const visitor = hashClientIp(visitorAddress(req, env.TRUST_PROXY));
        await this.limits.enforce(
            res,
            "storefront",
            `token:${token.id}`,
            share,
        );
        if (visitor) {
            await this.limits.enforce(
                res,
                "storefront",
                `visitor:${organizationId}:${visitor}`,
                share,
            );
        }
        await this.limits.enforce(
            res,
            "storefront",
            `org:${organizationId}`,
            cap,
        );

        let creator: OrganizationContext;
        try {
            creator = await this.organizations.resolve(
                token.apiKey.createdByUserId,
                organizationId,
            );
        } catch (error) {
            if (error instanceof HttpException) {
                throw refusal(
                    HttpStatus.UNAUTHORIZED,
                    "key_owner_inactive",
                    "The person who made the key behind this token no longer has access to the business.",
                );
            }
            throw error;
        }
        const live = creator.actions ?? new Set<OrgAction>();
        req.organizationContext = {
            ...creator,
            actions: new Set(
                TOKEN_ACTIONS.filter(
                    (a) => live.has(a) && token.apiKey.scope.includes(a),
                ),
            ),
        };
        req.storefrontToken = token;
        req.visitorHash = visitor;
        return true;
    }
}
