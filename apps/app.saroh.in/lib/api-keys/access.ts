import "server-only";

import type { ApiKeyListItem } from "@saroh/api-contract";

import { upgradeHref } from "@/lib/billing/access";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import type { NoAsk } from "@/lib/settings/queries";

import type { KeysScreen, UsageScreen } from "./queries";
import { apiKeysRead, apiUsageRead } from "./queries";
import { listApiKeys, readApiUsage } from "./service";

/** Connections: the Owner's (`apikey:manage`), while the API area is on. */
export async function mayReadKeys(): Promise<boolean> {
    if (!apiAreaOn()) return false;
    const org = await activeOrganizationOnce();
    return org?.actions?.includes("apikey:manage") ?? false;
}

/** Usage: everyone in the business (a Member sees the AI row only). */
export async function mayReadUsage(): Promise<boolean> {
    return apiAreaOn() && !!(await activeOrganizationOnce());
}

/** A key as its row and sheet draw it, field by field: never a token or its hash. */
export function keyFacts(k: ApiKeyListItem): ApiKeyListItem {
    return {
        id: k.id,
        kind: k.kind,
        name: k.name,
        prefix: k.prefix,
        scope: k.scope,
        allowedOrigins: k.allowedOrigins,
        aiEnabled: k.aiEnabled,
        createdByUserId: k.createdByUserId,
        rolledFromId: k.rolledFromId,
        expiresAt: k.expiresAt,
        revokedAt: k.revokedAt,
        graceUntil: k.graceUntil,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
        madeBy: {
            id: k.madeBy.id,
            name: k.madeBy.name,
            stillHere: k.madeBy.stillHere,
        },
    };
}

export const keysServer: ServerRead<NoAsk, KeysScreen> = {
    read: apiKeysRead,
    service: async () => {
        // The switch, plan and cap are the page's gate; the API refuses
        // the list when the area is off for this business.
        return { keys: (await listApiKeys()).map(keyFacts) };
    },
};

export const usageServer: ServerRead<NoAsk, UsageScreen> = {
    read: apiUsageRead,
    service: async () => {
        const [usage, org, billing] = await Promise.all([
            readApiUsage(),
            activeOrganizationOnce(),
            billingAccessOrNull(),
        ]);
        if (!usage) return null;
        const full = usage.minute.find((m) => m.cap > 0 && m.used >= m.cap);
        const row = full
            ? billing?.modules.find((m) => m.moduleId === `api-${full.scope}`)
            : undefined;
        const mayPlan = org?.actions?.includes("billing:manage") ?? false;
        return {
            usage,
            plan: billing?.plan?.name ?? null,
            upgrade:
                mayPlan && row?.upgradeTo
                    ? {
                          plan: row.upgradeTo.name,
                          href: upgradeHref(row.upgradeTo.planId),
                      }
                    : null,
        };
    },
};
