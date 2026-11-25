import type { AskAiState } from "@saroh/api-contract";

import type { NavCounts } from "@/components/shared/navigation/nav-items";
import type { BillingAccessView } from "@/lib/billing/access";
import type { PausedView } from "@/lib/billing/paused";
import type { StorefrontAllowance } from "@/lib/business-limits";
import type { AccountManager } from "@/lib/organizations/service";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

/**
 * The app shell's reads (owner, 25 Nov 2026): what the rail, the top bar,
 * the tab bar, the command menu and the plan banners draw, read in the
 * browser instead of on every server render. Client-safe; the services are
 * paired in `access.ts`. The server render keeps only what a gate needs
 * (session, the business and the role, a section's module guard).
 */

/** Every shell read of a business. */
export const shellKeys = (orgId: string): DomainKey =>
    domainKey("shell", orgId);

/** What the shell draws that changes only when a setting does. */
export interface ShellSettings {
    /**
     * Module keys on here, plus those shut only by the plan (drawn locked).
     * `null` = unknown: the nav fails open, as it always has.
     */
    moduleKeys: string[] | null;
    /** Rail rows the plan locks. */
    locked: string[];
    /** The business's sites, for the command menu: name and id only. */
    sites: { id: string; name: string }[];
    storefronts: StorefrontAllowance | null;
    stockTracked: boolean | null;
    paymentDue: BillingAccessView["paymentDue"] | null;
    planEnding: BillingAccessView["planEnding"] | null;
    paused: PausedView | null;
    accountManager: AccountManager | null;
    /** Ask AI's button and panel; null hides it (switch off, a Reviewer). */
    askAi: { state: AskAiState | null } | null;
    /** The Website area switch (DEC-240). */
    websiteArea: boolean;
}

/** What changes any minute: the bell and the rail's work badges. */
export interface ShellLive {
    unread: number;
    counts: NavCounts;
}

export const shellSettingsRead = defineRead<ShellSettings>()({
    key: (orgId) => domainKey("shell", orgId, "settings"),
    route: { path: "/api/shell", params: {} },
    tier: "settings",
});

export const shellLiveRead = defineRead<ShellLive>()({
    key: (orgId) => domainKey("shell", orgId, "live"),
    route: { path: "/api/shell/live", params: {} },
    tier: "live",
});
