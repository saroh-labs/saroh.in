/**
 * Sign-in for AI apps (plan 2026-11-10-001, U9): Better Auth as the OAuth
 * authorization server for Saroh's MCP server, one per edition.
 *
 * - `jwt()` signs access tokens bound to the MCP resource (`aud`).
 * - `mcp()` is the OAuth provider with that resource; it serves the
 *   protected-resource document and the authorize, token, register,
 *   continue and consent endpoints under `/api/auth`.
 * - `cimd()` takes Client ID Metadata Documents (Claude, ChatGPT, Claude
 *   Code), fetched by `@better-auth/cimd/node`: DNS resolved once, every
 *   answer public, the address pinned, no redirects followed.
 * - Dynamic registration stays on for clients without CIMD (Cursor, the
 *   MCP Inspector); Better Auth rate-limits it, the API sweeps unused ones.
 *
 * Addresses come from the instance's own: `https://api.<edition>` issues
 * (`…/api/auth`), the resource is `https://mcp.<edition>/mcp`, and the pages
 * a person sees are on `https://accounts.<edition>/oauth/…`. An instance
 * whose address doesn't start `api.` (a bare `localhost`) gets no OAuth.
 */
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { prisma } from "@saroh/database";
import type { BetterAuthPlugin } from "better-auth";
import { APIError } from "better-auth/api";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins";

/** What an AI app may ask for. `offline_access` asks for a refresh token. */
export const MCP_SCOPES = [
    "saroh:read",
    "saroh:write",
    "site:publish",
    "offline_access",
] as const;

/** A client with refresh: an hour, renewed silently (owner, 10 Nov). */
export const MCP_ACCESS_TOKEN_SECONDS = 60 * 60;
/** A client that asks for no refresh (ChatGPT): signs in again monthly. */
export const MCP_NO_REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;
/** A connection unused this long ends (refresh refused, guard refuses). */
export const MCP_IDLE_SECONDS = 90 * 24 * 60 * 60;

/** How long the businesses ticked on the pick page stand for the flow. */
export const OAUTH_PICK_SECONDS = 10 * 60;

/** The Verification row holding a session's ticked businesses. */
export const oauthPickIdentifier = (sessionId: string) =>
    `oauth-pick:${sessionId}`;

/**
 * A set of businesses as one string: sorted ids joined by commas. It is the
 * consent's reference (person + app + this set: another set is another
 * consent) and is what the pick stores. Ids never hold a comma.
 */
export const businessSetKey = (organizationIds: readonly string[]) =>
    [...new Set(organizationIds)].sort().join(",");

/** The ids in a {@link businessSetKey}. */
export const businessSetOf = (key: string | null | undefined): string[] =>
    (key ?? "").split(",").filter(Boolean);

export interface McpAddresses {
    /** What signs the tokens: `iss`. */
    issuer: string;
    /** The MCP server: every token's `aud`. */
    resource: string;
    /** Where the pick and consent pages are. */
    accounts: string;
}

/**
 * The OAuth addresses of the instance answering on `baseURL`, or null when
 * it isn't an `api.` address (no MCP for it).
 */
export function mcpAddressesOf(
    baseURL: string | undefined,
): McpAddresses | null {
    if (!baseURL) return null;
    let url: URL;
    try {
        url = new URL(baseURL);
    } catch {
        return null;
    }
    if (!url.host.startsWith("api.")) return null;
    const rest = url.host.slice("api.".length);
    return {
        issuer: `${url.origin}/api/auth`,
        resource: `${url.protocol}//mcp.${rest}/mcp`,
        accounts: `${url.protocol}//accounts.${rest}`,
    };
}

/** The businesses a session ticked ({@link businessSetKey}), while they stand. */
export async function readOAuthPick(sessionId: string): Promise<string | null> {
    const row = await prisma.verification.findFirst({
        where: {
            identifier: oauthPickIdentifier(sessionId),
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: { value: true },
    });
    return row?.value ?? null;
}

/** The plugins for one instance; none when it has no MCP addresses. */
export function mcpOAuthPlugins(
    baseURL: string | undefined,
): BetterAuthPlugin[] {
    const at = mcpAddressesOf(baseURL);
    if (!at) return [];
    return [
        jwt({
            // Sessions never turn into JWTs: only OAuth access tokens are signed.
            disableSettingJwtHeader: true,
            jwt: { issuer: at.issuer },
        }),
        mcp({
            resource: at.resource,
            loginPage: `${at.accounts}/oauth/pick-business`,
            consentPage: `${at.accounts}/oauth/consent`,
            scopes: [...MCP_SCOPES],
            // Earliest wins: with a refresh token, an hour; without, 30 days.
            accessTokenExpiresIn: MCP_NO_REFRESH_TOKEN_SECONDS,
            // A number here is an absolute time: say it as a duration.
            scopeExpirations: {
                offline_access: `${MCP_ACCESS_TOKEN_SECONDS}s`,
            },
            // Each refresh rotates it, so this is the 90-day idle end.
            refreshTokenExpiresIn: MCP_IDLE_SECONDS,
            allowDynamicClientRegistration: true,
            allowUnauthenticatedClientRegistration: true,
            // "web" refuses loopback redirects: Claude Code and Cursor register those.
            clientRegistrationDefaultApplicationType: "infer",
            grantTypes: ["authorization_code", "refresh_token"],
            postLogin: {
                page: `${at.accounts}/oauth/pick-business`,
                // Every flow asks which businesses. A continuation comes from
                // the pick page only after the API stored the pick, but the
                // client sends it, so the pick is checked again.
                shouldRedirect: async ({ session, isContinuation }) =>
                    !isContinuation || !(await readOAuthPick(session.id)),
                consentReferenceId: async ({ session }) => {
                    const org = await readOAuthPick(session.id);
                    if (!org) {
                        // eslint-disable-next-line @typescript-eslint/only-throw-error -- APIError extends Error at runtime; see server.ts
                        throw new APIError("BAD_REQUEST", {
                            error: "invalid_request",
                            error_description: "No business was ticked.",
                        });
                    }
                    return org;
                },
            },
            // The businesses ride in the token; the API checks the grant's
            // live set, and the person's role in the one named, every call.
            customAccessTokenClaims: ({ referenceId }) =>
                referenceId ? { orgs: businessSetOf(referenceId) } : {},
        }),
        cimd({
            fetchClientMetadataResource,
            metadataProfile: "mcp-2026-07-28",
        }),
    ];
}

/** What a verified AI app's access token says. */
export interface McpTokenClaims {
    /** The person. */
    sub: string;
    /** The app (`azp`, its client id). */
    clientId: string;
    /** The businesses ticked at sign-in. */
    orgs: string[];
    scopes: string[];
    exp?: number;
}

/**
 * An AI app's access token, checked against the instance that signed it:
 * signature (its own keys, read in process), issuer, audience = this
 * instance's MCP resource, expiry. A token sender-bound by DPoP is refused:
 * v1 checks bearer tokens only. Throws when anything fails.
 */
export async function verifyMcpAccessToken(
    auth: {
        options: { baseURL?: unknown };
        api: unknown;
    },
    token: string,
): Promise<McpTokenClaims> {
    const at = mcpAddressesOf(
        typeof auth.options.baseURL === "string"
            ? auth.options.baseURL
            : undefined,
    );
    if (!at) throw new Error("no MCP on this address");
    const api = auth.api as { getJwks: () => Promise<never> };
    const claims = await verifyJwsAccessToken(token, {
        jwksFetch: () => api.getJwks(),
        jwksCacheKey: auth,
        verifyOptions: {
            issuer: at.issuer,
            audience: at.resource,
            requiredClaims: ["sub", "azp"],
        },
    });
    if (claims.cnf) throw new Error("sender-bound token");
    // A single `org` is what tokens said before a connection held several.
    const orgs = Array.isArray(claims.orgs)
        ? claims.orgs.filter((o): o is string => typeof o === "string" && !!o)
        : typeof claims.org === "string" && claims.org
          ? [claims.org]
          : [];
    if (orgs.length === 0) throw new Error("token names no business");
    return {
        sub: String(claims.sub),
        clientId: String(claims.azp),
        orgs,
        scopes:
            typeof claims.scope === "string"
                ? claims.scope.split(" ").filter(Boolean)
                : [],
        exp: claims.exp,
    };
}
