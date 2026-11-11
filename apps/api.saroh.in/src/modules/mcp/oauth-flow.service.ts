import {
    BadRequestException,
    ForbiddenException,
    HttpException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import {
    businessSetKey,
    businessSetOf,
    mcpAddressesOf,
    OAUTH_PICK_SECONDS,
    oauthPickIdentifier,
    readOAuthPick,
} from "@saroh/auth";
import { prisma } from "@saroh/database";
import { randomUUID } from "node:crypto";

import { authFor } from "../../common/auth/auth";
import { authEditionOf } from "../../common/auth/auth-address";
import { env } from "../../env";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { membersMayOpen } from "../organizations/organization-lifecycle.policy";
import { isKnownClient, refusedClient, SCOPE_WORDS } from "./ai-apps";
import { AiConnectionsService, endConnection } from "./ai-connections.service";

/** Who is signing in: the session, the request's address and its cookies. */
export interface FlowCaller {
    userId: string;
    sessionId: string;
    host: string | undefined;
    cookie: string | undefined;
}

export interface PickableBusiness {
    id: string;
    name: string;
}

export interface ConsentDetails {
    app: { name: string | null; known: boolean };
    redirectHost: string | null;
    /** The businesses ticked on the pick page; empty when none stand. */
    businesses: PickableBusiness[];
    can: string[];
    /** The app imitates Saroh, Claude, ChatGPT or OpenAI: no Allow. */
    refused: boolean;
}

/**
 * The API's half of an AI app's sign-in (U9), behind the accounts pages
 * `/oauth/pick-business` and `/oauth/consent`. Better Auth's own continue
 * and consent endpoints are closed from outside (`oauth-gate.ts`); only
 * these call them, after their checks:
 *
 * - pick: one or more ticked businesses, each of this address's edition and
 *   one the person may open, never a demo ("All my businesses" is the list
 *   they have now, sent as ids). Stored for the session for
 *   {@link OAUTH_PICK_SECONDS} as a {@link businessSetKey}, which Better Auth
 *   reads as the consent's reference: another set is another consent;
 * - consent: an app wearing a known name it doesn't own is refused; an
 *   Allow puts the set on the grant (`organizationIds`) and is recorded on
 *   each business's activity.
 *
 * Every answer is 404 while `API_MCP` is off.
 */
@Injectable()
export class OAuthFlowService {
    private readonly logger = new Logger(OAuthFlowService.name);

    constructor(
        private readonly organizations: OrganizationContextService,
        private readonly connections: AiConnectionsService,
        private readonly flags: FeatureFlagService,
    ) {}

    /** This edition's businesses the person may connect, by name. */
    async businesses(caller: FlowCaller): Promise<PickableBusiness[]> {
        await this.assertOn();
        const rows = await prisma.membership.findMany({
            where: {
                userId: caller.userId,
                organization: {
                    isDemo: false,
                    edition: authEditionOf(
                        apiHost(caller.host),
                        env.BETTER_AUTH_URL,
                    ),
                },
            },
            select: {
                organization: {
                    select: { id: true, name: true, lifecycleStatus: true },
                },
            },
            orderBy: { organization: { name: "asc" } },
        });
        return rows
            .filter((r) => membersMayOpen(r.organization.lifecycleStatus))
            .map(({ organization: { id, name } }) => ({ id, name }));
    }

    /** Store the ticked set, then let Better Auth go on to consent or the app. */
    async pick(
        caller: FlowCaller,
        organizationIds: string[],
        oauthQuery: string,
    ): Promise<{ url: string }> {
        const ids = businessSetOf(businessSetKey(organizationIds));
        if (ids.length === 0) {
            throw new BadRequestException("Tick at least one business.");
        }
        const offered = new Set(
            (await this.businesses(caller)).map((b) => b.id),
        );
        if (ids.some((id) => !offered.has(id))) {
            throw new ForbiddenException(
                "You can't connect an app to one of those businesses.",
            );
        }
        // Their role, live: a paused or removed person is refused here.
        for (const id of ids) {
            await this.organizations.resolve(caller.userId, id);
        }
        const referenceId = businessSetKey(ids);
        // This set's grant, if it lost a business since (a disconnect), is
        // ended, so the person sees the consent page again instead of
        // Better Auth reusing a grant that no longer covers the set.
        const clientId = new URLSearchParams(oauthQuery).get("client_id") ?? "";
        const earlier = await prisma.oauthConsent.findFirst({
            where: { clientId, userId: caller.userId, referenceId },
        });
        if (
            earlier &&
            businessSetKey(earlier.organizationIds) !== referenceId
        ) {
            await endConnection(earlier);
        }
        const now = Date.now();
        await prisma.verification.create({
            data: {
                id: randomUUID(),
                identifier: oauthPickIdentifier(caller.sessionId),
                value: referenceId,
                expiresAt: new Date(now + OAUTH_PICK_SECONDS * 1000),
            },
        });
        return this.callAuth(caller, "continue", {
            postLogin: true,
            oauth_query: oauthQuery,
        });
    }

    /** What the consent page shows. */
    async consentDetails(
        caller: FlowCaller,
        oauthQuery: string,
    ): Promise<ConsentDetails> {
        await this.assertOn();
        const query = new URLSearchParams(oauthQuery);
        const client = await prisma.oauthClient.findUnique({
            where: { clientId: query.get("client_id") ?? "" },
            select: { clientId: true, name: true },
        });
        if (!client)
            throw new NotFoundException("This app isn't known to Saroh.");
        const picked = businessSetOf(await readOAuthPick(caller.sessionId));
        const businesses = picked.length
            ? await prisma.organization.findMany({
                  where: { id: { in: picked } },
                  select: { id: true, name: true },
                  orderBy: { name: "asc" },
              })
            : [];
        let redirectHost: string | null = null;
        try {
            redirectHost = new URL(query.get("redirect_uri") ?? "").host;
        } catch {
            // left null
        }
        const scopes = (query.get("scope") ?? "").split(" ").filter(Boolean);
        return {
            app: { name: client.name, known: isKnownClient(client.clientId) },
            redirectHost,
            businesses,
            can: scopes.flatMap((s) =>
                SCOPE_WORDS[s] ? [SCOPE_WORDS[s]] : [],
            ),
            refused: refusedClient(client),
        };
    }

    /** Allow or Deny; an Allow is the connection, recorded on the business. */
    async consent(
        caller: FlowCaller,
        accept: boolean,
        oauthQuery: string,
    ): Promise<{ url: string }> {
        const details = await this.consentDetails(caller, oauthQuery);
        if (accept && details.refused) {
            throw new ForbiddenException(
                "Saroh doesn't connect this app: its name copies another company's.",
            );
        }
        if (accept && details.businesses.length === 0) {
            throw new BadRequestException(
                "Pick a business first. Go back to the app and connect again.",
            );
        }
        const next = await this.callAuth(caller, "consent", {
            accept,
            oauth_query: oauthQuery,
        });
        if (accept && details.businesses.length > 0) {
            const clientId =
                new URLSearchParams(oauthQuery).get("client_id") ?? "";
            const organizationIds = details.businesses.map((b) => b.id);
            const referenceId = businessSetKey(organizationIds);
            const found = await prisma.oauthConsent.findFirst({
                where: { clientId, userId: caller.userId, referenceId },
            });
            // Before the app gets its code: the grant reaches the whole set.
            const grant =
                found &&
                (await prisma.oauthConsent.update({
                    where: { id: found.id },
                    data: { organizationIds: businessSetOf(referenceId) },
                }));
            if (grant) {
                await this.connections
                    .recordConnected(grant, details.app.name)
                    .catch((error: unknown) =>
                        this.logger.warn(
                            `ai_connection_audit_failed: ${error instanceof Error ? error.message : String(error)}`,
                        ),
                    );
            }
        }
        return next;
    }

    private async assertOn(): Promise<void> {
        if (!(await this.flags.isEnabled(FlagKey.API_MCP))) {
            throw new NotFoundException();
        }
    }

    /**
     * Better Auth's `/oauth2/<step>` as the signed-in person. It checks the
     * signed query (and its expiry) itself; a refusal comes back in words.
     */
    private async callAuth(
        caller: FlowCaller,
        step: "continue" | "consent",
        body: Record<string, unknown>,
    ): Promise<{ url: string }> {
        const auth = authFor(caller.host);
        const at = mcpAddressesOf(
            typeof auth.options.baseURL === "string"
                ? auth.options.baseURL
                : undefined,
        );
        if (!at) throw new NotFoundException();
        const res = await auth.handler(
            new Request(`${at.issuer}/oauth2/${step}`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    accept: "application/json",
                    origin: at.accounts,
                    cookie: caller.cookie ?? "",
                },
                body: JSON.stringify(body),
            }),
        );
        const answer = (await res.json().catch(() => ({}))) as {
            url?: string;
            error?: string;
        };
        if (res.ok && answer.url) return { url: answer.url };
        if (res.status >= 500) {
            throw new HttpException(
                "Saroh couldn't finish connecting the app. Try again.",
                502,
            );
        }
        throw new BadRequestException(
            "This sign-in has expired or was changed. Go back to the app and connect again.",
        );
    }
}

/** The API address a request reached, for an MCP or API host alike. */
function apiHost(host: string | undefined): string | undefined {
    return host?.trim().replace(/^mcp\./i, "api.");
}
