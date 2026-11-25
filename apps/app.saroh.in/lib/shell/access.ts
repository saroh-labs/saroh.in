import "server-only";

import {
    lockedNavHrefs,
    planLockedModuleKeys,
} from "@/components/shared/navigation/nav-locks";
import { ApiError } from "@/lib/api/errors";
import { apiFetch, orgBase } from "@/lib/api/http";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { getAskAiState } from "@/lib/ask-ai/service";
import { getHomeRail } from "@/lib/home/rail";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { unreadNotificationCount } from "@/lib/notifications/service";
import {
    accountManagerOrNull,
    activeOrganizationOnce,
} from "@/lib/organizations/service";
import type { Access, ServerRead } from "@/lib/query/route";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { billingAccessOrNull, pausedOrNull } from "@/lib/saroh-billing/service";
import { listSites } from "@/lib/sites/service";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";
import { stockTrackingOnce } from "@/lib/stock/access";
import { getStorefrontAllowance } from "@/lib/stores/storefronts";

import type { ShellLive, ShellSettings } from "./queries";
import { shellLiveRead, shellSettingsRead } from "./queries";

/**
 * The shell's reads (owner, 25 Nov 2026), once per full load instead of on
 * every server render. Anyone in the business may read them: each part is
 * an aid the API shapes or refuses by role (billing to those who may read
 * it, stock tracking to those who may read stock), and a part that can't
 * be read is `null`, so the chrome fails open as it always has and never
 * blanks a page.
 */
export async function readShellSettings(): Promise<ShellSettings> {
    const business = activeOrganizationOnce();
    const [
        modules,
        sites,
        storefronts,
        stock,
        billing,
        paused,
        accountManager,
        askAi,
        websiteArea,
    ] = await Promise.all([
        modulesOrUnknown(),
        // The palette wants a name and an id, not the site's blob.
        listSites()
            .then((all) => all.map((s) => ({ id: s.id, name: s.name })))
            .catch(() => []),
        getStorefrontAllowance().catch(() => null),
        stockTrackingOnce(),
        billingAccessOrNull(),
        pausedOrNull(),
        business
            .then((b) => (b ? accountManagerOrNull(b.id) : null))
            .catch(() => null),
        // A Reviewer has no Ask AI at all; null state when unread, and the
        // panel says so.
        business
            .then(async (b) =>
                askAiOn() && b && b.role !== "REVIEWER"
                    ? { state: await getAskAiState().catch(() => null) }
                    : null,
            )
            .catch(() => null),
        websiteAreaOn(),
    ]);
    // Shut only by the plan: locked, not off, so they stay in the rail
    // with a lock (U14). None while plans aren't shown (DEC-136).
    const planLocked =
        modules && plansShown() ? planLockedModuleKeys(modules) : [];
    return {
        moduleKeys: modules
            ? [
                  ...modules
                      .filter((m) => m.readiness !== "DISABLED")
                      .map((m) => m.key),
                  ...planLocked,
              ]
            : null,
        locked: lockedNavHrefs(planLocked, billing),
        sites,
        storefronts,
        stockTracked: stock?.tracked ?? null,
        paymentDue: billing?.paymentDue ?? null,
        planEnding: billing?.planEnding ?? null,
        paused,
        accountManager,
        askAi,
        websiteArea,
    };
}

/**
 * The bell and the rail's badges, in one call (owner, 25 Nov 2026):
 * `GET /home/badges` counts them in the API, the rail's own rules by count
 * alone, so a live tick or a save no longer pays for the rail's actions
 * and the business's row besides. The API refuses a non-member or a paused
 * seat (403). An API without it yet (404/405: the app ships first) answers
 * from the rail, as before it.
 */
export async function readShellLive(): Promise<ShellLive> {
    const base = await orgBase();
    if (!base) throw new ApiError(401, "GET home/badges");
    const res = await apiFetch(`${base}/home/badges`);
    if (res.status === 404 || res.status === 405)
        return readShellLiveFromRail();
    if (!res.ok) throw new ApiError(res.status, "GET home/badges");
    const read = (await res.json()) as Partial<ShellLive> | null;
    return {
        unread: typeof read?.unread === "number" ? read.unread : 0,
        counts: Object.fromEntries(
            Object.entries(read?.counts ?? {}).filter(
                ([, n]) => typeof n === "number" && n > 0,
            ),
        ),
    };
}

/**
 * Before `/home/badges`: the unread count and the rail's OVERDUE work with
 * a count, behind the membership the route asks of everyone else. Only
 * OVERDUE work becomes a badge: advice ("Add a product") is not a queue.
 * Non-fatal: a rail without badges is a working rail.
 */
async function readShellLiveFromRail(): Promise<ShellLive> {
    if (!(await activeOrganizationOnce())) {
        throw new ApiError(403, "GET home/badges");
    }
    const [unread, rail] = await Promise.all([
        unreadNotificationCount().catch(() => 0),
        getHomeRail().catch(() => null),
    ]);
    return {
        unread,
        counts: Object.fromEntries(
            (rail?.actions ?? [])
                .filter((a) => a.severity === "OVERDUE" && (a.count ?? 0) > 0)
                .map((a) => [a.href, a.count]),
        ),
    };
}

/**
 * Who may read the shell: anyone the API still counts in the business. A
 * removed member or a paused seat is refused there (a 403, which marks the
 * tab's business list stale), not answered with empty chrome.
 */
export const shellAccess: Access = async () =>
    (await activeOrganizationOnce()) !== null;

type NoParams = Parameters<typeof shellSettingsRead.key>[1];

export const shellSettingsServer: ServerRead<NoParams, ShellSettings> = {
    read: shellSettingsRead,
    service: readShellSettings,
};

export const shellLiveServer: ServerRead<NoParams, ShellLive> = {
    read: shellLiveRead,
    service: readShellLive,
};
