import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { McpTokenClaims } from "@saroh/auth";
import {
    MCP_IDLE_SECONDS,
    mcpAddressesOf,
    verifyMcpAccessToken,
} from "@saroh/auth";
import { prisma } from "@saroh/database";
import type { Request, Response } from "express";

import { authFor } from "../../common/auth/auth";
import { assertEditionMatchesAddress } from "../../common/edition-address";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ApiKeyGuard } from "../api-keys/api-key.guard";
import { TOKEN_PATTERN } from "../api-keys/api-keys.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { OrgAction } from "../organizations/organization-actions";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { actionsForScopes, NEVER_FOR_AI } from "./ai-apps";

/** `lastUsedAt` is written at most this often per connection, per replica. */
export const TOUCH_EVERY_MS = 60_000;

/** The connection a call came through, for activity and restore points (U10). */
export type McpConnection =
    | {
          kind: "oauth";
          /** The grant (`OauthConsent.id`): the connection's id. */
          id: string;
          clientId: string;
          clientName: string | null;
          scopes: string[];
      }
    | { kind: "key"; id: string; clientName: string | null };

export interface McpRequest extends Request {
    organizationContext?: OrganizationContext;
    mcpConnection?: McpConnection;
}

/**
 * The front door of `/mcp` (plan 2026-11-10-001, U9): an AI app's OAuth
 * access token, or a secret key with the AI switch on. Like `ApiKeyGuard`,
 * it builds the standard {@link OrganizationContext}, never reads the
 * session cookie, and takes the business only from the token or key.
 *
 * For a token, on every call:
 * - the address must be this edition's MCP address (else 404), and the
 *   `API_MCP` switch on, for the business too (else 404);
 * - signature, issuer (`api.<edition>`), audience (`mcp.<edition>/mcp`) and
 *   expiry (`verifyMcpAccessToken`);
 * - the grant is loaded: refused once disconnected (consent gone), idle 90
 *   days, its app disabled, or, for an app with refresh, its refresh tokens
 *   all revoked or expired (a reused refresh token, a disconnect). A signed
 *   token can't be revoked, so this is what ends a still-unexpired one;
 * - the person must still hold the business (`resolve`): else 401.
 *
 * `actions` = the granted scopes' actions ∩ the person's live actions, minus
 * {@link NEVER_FOR_AI}. Refusals are 401 with a `WWW-Authenticate` naming the
 * protected-resource document, so a client signs in again.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
    private readonly logger = new Logger(McpAuthGuard.name);
    private readonly touched = new Map<string, number>();

    constructor(
        private readonly organizations: OrganizationContextService,
        private readonly keys: ApiKeyGuard,
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const req = http.getRequest<McpRequest>();
        const res = http.getResponse<Response>();
        const host = (req.headers.host ?? "").trim().toLowerCase();
        const auth = authFor(host);
        const at = mcpAddressesOf(
            typeof auth.options.baseURL === "string"
                ? auth.options.baseURL
                : undefined,
        );
        if (!at || new URL(at.resource).host !== host) {
            throw new NotFoundException();
        }
        if (!(await this.flags.isEnabled(FlagKey.API_MCP))) {
            throw new NotFoundException();
        }
        const resource = new URL(at.resource);
        const challenge = (error?: string) => {
            res.setHeader(
                "WWW-Authenticate",
                `Bearer ${error ? `error="${error}", ` : ""}resource_metadata="${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}"`,
            );
            return new HttpException(
                {
                    error: {
                        code: "unauthorized",
                        message:
                            "Sign in to Saroh again to reconnect this app.",
                    },
                },
                HttpStatus.UNAUTHORIZED,
            );
        };

        const token = bearerOf(req.headers.authorization);
        if (!token) throw challenge();

        const now = new Date();
        const found = TOKEN_PATTERN.test(token)
            ? await this.keyContext(token, now)
            : await this.tokenContext(auth, token, now);
        if (!found) throw challenge("invalid_token");
        const { context: ctx, connection } = found;

        if (
            !(await this.flags.isEnabled(FlagKey.API_MCP, ctx.organizationId))
        ) {
            throw new NotFoundException();
        }
        try {
            assertEditionMatchesAddress(
                ctx.edition,
                host.replace(/^mcp\./, "api."),
            );
        } catch {
            throw new NotFoundException();
        }

        req.organizationContext = ctx;
        req.mcpConnection = connection;
        if (connection.kind === "oauth") this.touch(connection.id, now);
        return true;
    }

    /** A token's context, or null for anything that opens nothing. */
    private async tokenContext(
        auth: Parameters<typeof verifyMcpAccessToken>[0],
        token: string,
        now: Date,
    ): Promise<{
        context: OrganizationContext;
        connection: McpConnection;
    } | null> {
        let claims: McpTokenClaims;
        try {
            claims = await verifyMcpAccessToken(auth, token);
        } catch {
            return null;
        }
        const grant = await prisma.oauthConsent.findFirst({
            where: {
                clientId: claims.clientId,
                userId: claims.sub,
                referenceId: claims.org,
            },
            select: {
                id: true,
                scopes: true,
                createdAt: true,
                lastUsedAt: true,
            },
        });
        if (!grant || isIdle(grant, now)) return null;
        const client = await prisma.oauthClient.findUnique({
            where: { clientId: claims.clientId },
            select: { name: true, disabled: true },
        });
        if (!client || client.disabled) return null;
        if (claims.scopes.includes("offline_access")) {
            const live = await prisma.oauthRefreshToken.count({
                where: {
                    clientId: claims.clientId,
                    userId: claims.sub,
                    referenceId: claims.org,
                    revoked: null,
                    expiresAt: { gt: now },
                },
            });
            if (live === 0) return null;
        }
        const person = await this.person(claims.sub, claims.org);
        if (!person) return null;
        // What was granted then, narrowed by what the grant says now.
        const scopes = claims.scopes.filter((s) => grant.scopes.includes(s));
        return {
            context: narrowed(person, actionsForScopes(scopes)),
            connection: {
                kind: "oauth",
                id: grant.id,
                clientId: claims.clientId,
                clientName: client.name,
                scopes,
            },
        };
    }

    /** A secret key with the AI switch on; any other key opens nothing here. */
    private async keyContext(
        token: string,
        now: Date,
    ): Promise<{
        context: OrganizationContext;
        connection: McpConnection;
    } | null> {
        let found: Awaited<ReturnType<ApiKeyGuard["contextFor"]>>;
        try {
            found = await this.keys.contextFor(token, now);
        } catch {
            return null; // Its maker left the business.
        }
        if (found?.key.kind !== "SECRET" || !found.key.aiEnabled) {
            return null;
        }
        return {
            context: narrowed(
                found.context,
                found.context.actions ?? new Set<OrgAction>(),
            ),
            connection: {
                kind: "key",
                id: found.key.id,
                clientName: found.key.name,
            },
        };
    }

    /** The person's live context, or null once they no longer hold the business. */
    private async person(
        userId: string,
        organizationId: string,
    ): Promise<OrganizationContext | null> {
        try {
            return await this.organizations.resolve(userId, organizationId);
        } catch (error) {
            if (error instanceof HttpException) return null;
            throw error;
        }
    }

    /** Fire and forget, at most once a {@link TOUCH_EVERY_MS} per connection. */
    private touch(consentId: string, now: Date): void {
        const t = now.getTime();
        const last = this.touched.get(consentId);
        if (last !== undefined && t - last < TOUCH_EVERY_MS) return;
        if (this.touched.size >= 10_000) this.touched.clear();
        this.touched.set(consentId, t);
        void prisma.oauthConsent
            .update({ where: { id: consentId }, data: { lastUsedAt: now } })
            .catch((error: unknown) => {
                this.logger.warn(
                    `ai_connection_touch_failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            });
    }
}

/** Idle: unused (or, never used, made) {@link MCP_IDLE_SECONDS} or more ago. */
export function isIdle(
    grant: { createdAt: Date | null; lastUsedAt: Date | null },
    now: Date,
): boolean {
    const last = grant.lastUsedAt ?? grant.createdAt;
    if (!last) return true;
    return now.getTime() - last.getTime() >= MCP_IDLE_SECONDS * 1000;
}

/** The person's live actions ∩ `allowed`, never {@link NEVER_FOR_AI}. */
function narrowed(
    person: OrganizationContext,
    allowed: ReadonlySet<OrgAction>,
): OrganizationContext {
    const live = person.actions ?? new Set<OrgAction>();
    const actions = new Set(
        [...allowed].filter((a) => live.has(a) && !NEVER_FOR_AI.has(a)),
    );
    return { ...person, actions };
}

/** The token in `Authorization: Bearer …`, or undefined. */
function bearerOf(header: string | undefined): string | undefined {
    return /^Bearer\s+(\S+)\s*$/i.exec(header ?? "")?.[1];
}
