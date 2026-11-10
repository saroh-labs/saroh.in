import { Injectable } from "@nestjs/common";

import type { EntitlementMap } from "../billing/entitlement.service";
import { EntitlementService } from "../billing/entitlement.service";

/** The public surfaces a request is limited on (plan 2026-11-10-001, U4). */
export type LimitScope = "mcp" | "secret" | "storefront";

/** Each surface's requests-a-minute row in the pricing catalogue (`MODULE_MAP`). */
export const RPM_ROWS: Readonly<Record<LimitScope, string>> = {
    mcp: "api-mcp",
    secret: "api-secret",
    storefront: "api-storefront",
};

/**
 * FALLBACK ONLY, not a plan value: the cap a business gets while the
 * published catalogue has no number for the surface (no row yet, or a row
 * that's on with no cap). The real caps are the catalogue's data. Kept low
 * on purpose so a missing row never opens a surface wide.
 */
export const FALLBACK_RPM = 60;

/** How long a business's caps are reused before the catalogue is read again. */
export const CAPS_TTL_MS = 60_000;

const SWEEP_AT = 10_000;

/** A catalogue value as a requests-a-minute cap: off is 0, no number the fallback. */
export function rpmCap(value: number | boolean | undefined): number {
    if (typeof value === "number") return value;
    return value === false ? 0 : FALLBACK_RPM;
}

/**
 * Per-business caps for the public API, read through the entitlement path
 * (plan, overrides, add-ons) and kept in memory for `CAPS_TTL_MS`, so a
 * limited request doesn't read the catalogue each time. A plan change shows
 * within the TTL.
 */
@Injectable()
export class CapsService {
    private readonly cache = new Map<
        string,
        { at: number; entitlements: EntitlementMap }
    >();

    constructor(private readonly entitlements: EntitlementService) {}

    async rpm(
        organizationId: string,
        scope: LimitScope,
        now: number = Date.now(),
    ): Promise<number> {
        const map = await this.entitlementsOf(organizationId, now);
        return rpmCap(map[RPM_ROWS[scope]]);
    }

    private async entitlementsOf(
        organizationId: string,
        now: number,
    ): Promise<EntitlementMap> {
        const hit = this.cache.get(organizationId);
        if (hit && now - hit.at < CAPS_TTL_MS) return hit.entitlements;
        if (this.cache.size >= SWEEP_AT) {
            for (const [k, v] of this.cache) {
                if (now - v.at >= CAPS_TTL_MS) this.cache.delete(k);
            }
        }
        const entitlements =
            await this.entitlements.getEntitlements(organizationId);
        this.cache.set(organizationId, { at: now, entitlements });
        return entitlements;
    }
}
