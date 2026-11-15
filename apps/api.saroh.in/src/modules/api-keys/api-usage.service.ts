import { Injectable, Optional } from "@nestjs/common";
import type {
    ApiKeyKind,
    ApiUsageScope,
    ApiUsageView,
} from "@saroh/api-contract";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import type { EntitlementMap } from "../billing/entitlement.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { allows } from "../organizations/organization-policy";
import { CapsService } from "../rate-limits/caps";
import { LimitsService } from "../rate-limits/limits.service";
import { liveWhere } from "./api-keys.service";

const KIND_SURFACE: Record<ApiKeyKind, ApiUsageScope> = {
    SECRET: "secret",
    PUBLISHABLE: "storefront",
};

/** The plan row's cap: a number, none (true), or not on the plan (0). */
function capOf(map: EntitlementMap, row: string): number | null {
    const value = map[row];
    if (value === true) return null;
    return typeof value === "number" ? value : 0;
}

/**
 * Settings › API and AI apps › Usage, and whether its Keys and Webhooks
 * tabs are open (U14). The caps are the ones the limiter and the key and
 * webhook services enforce, read the same way; this minute's calls are the
 * business-wide windows (`org:<id>`), read without taking a call. Everyone
 * sees the AI row; keys need `apikey:manage`, webhooks `webhook:manage`.
 */
@Injectable()
export class ApiUsageService {
    constructor(
        private readonly caps: CapsService,
        private readonly limits: LimitsService,
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
    ) {}

    async read(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<ApiUsageView> {
        const org = ctx.organizationId;
        const keysToo = allows(ctx, "apikey:manage");
        const hooksToo = allows(ctx, "webhook:manage");
        const on = async (flag: FlagKey) => this.flags.isEnabled(flag, org);
        const [mcpOn, secretOn, storefrontOn, hooksOn] = await Promise.all([
            on(FlagKey.API_MCP),
            on(FlagKey.API_SECRET),
            on(FlagKey.API_STOREFRONT),
            on(FlagKey.API_WEBHOOKS),
        ]);
        const flagged: Record<ApiUsageScope, boolean> = {
            mcp: mcpOn,
            secret: secretOn,
            storefront: storefrontOn,
        };
        const scopes = (["mcp", "secret", "storefront"] as const).filter(
            (s) => flagged[s] && (s === "mcp" || keysToo),
        );
        const minute = await Promise.all(
            scopes.map(async (scope) => {
                const cap = await this.caps.rpm(org, scope, now.getTime());
                const used = await this.limits.used(
                    scope,
                    `org:${org}`,
                    cap,
                    now.getTime(),
                );
                return { scope, used, cap };
            }),
        );
        const needsPlan = (keysToo && (secretOn || storefrontOn)) || hooksToo;
        const map = needsPlan
            ? (await this.access.resolve(org, now)).entitlements
            : {};

        let keys: ApiUsageView["keys"] = null;
        if (keysToo) {
            const kinds = (["SECRET", "PUBLISHABLE"] as const).filter(
                (k) => flagged[KIND_SURFACE[k]],
            );
            const keyCap = capOf(map, "api-keys");
            const open =
                keyCap === 0
                    ? []
                    : kinds.filter(
                          (k) =>
                              map[
                                  k === "SECRET"
                                      ? "api-secret"
                                      : "api-storefront"
                              ],
                      );
            keys = {
                kinds,
                open,
                count: await prisma.apiKey.count({
                    where: { organizationId: org, ...liveWhere(now) },
                }),
                cap: keyCap === 0 ? 0 : keyCap,
            };
        }

        let webhooks: ApiUsageView["webhooks"] = null;
        if (hooksToo && hooksOn) {
            const cap = capOf(map, "webhooks");
            webhooks = {
                open: cap !== 0,
                count: await prisma.webhookEndpoint.count({
                    where: { organizationId: org },
                }),
                cap,
            };
        }

        return { at: now.toISOString(), minute, keys, webhooks };
    }
}
