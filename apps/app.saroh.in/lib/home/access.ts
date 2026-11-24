import "server-only";

import { cache } from "react";

import type { HomeSetup } from "@/components/home/dashboard/home-setup";
import { listModules } from "@/lib/modules/service";
import { getSeenMoments } from "@/lib/moments/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import type { ServerRead } from "@/lib/query/route";
import { firstSteps, mayFinishSetup } from "@/lib/settings/ready";
import { loadReadyChecklist } from "@/lib/settings/ready-service";
import { shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";

import { homeRead, homeSetupRead } from "./queries";
import type { HomeModel } from "./service";
import { getHome } from "./service";

/**
 * Who reads what on Home (DEC-259), asked by the page and by the routes
 * alike, so the two can't differ.
 *
 * - Home itself: anyone in the business. The API shapes it by role: a
 *   Reviewer's holds only what was sent to them (F9), a staff member's
 *   their storefronts and diary (F11); `view` says which.
 * - "Finish setup": only someone who may change the business
 *   (`org:update`), whose steps they are; anyone else gets a 403.
 */

/** What is turned on, once per request; null when it can't be read. */
export const homeModules = cache(() => listModules().catch(() => null));

/** Whether this person is shown "Finish setup". */
export async function maySeeSetup(): Promise<boolean> {
    return mayFinishSetup(await activeOrganizationOnce());
}

/**
 * Home as the screen draws it: the API's answer without what no part of
 * Home shows (the old ranked `actions` and their evidence, and the week's
 * figures besides cheques waiting), so the browser isn't sent them.
 */
export async function readHomeScreen(): Promise<HomeModel> {
    const home = await getHome();
    return {
        ...home,
        actions: [],
        week: home.week
            ? {
                  zone: home.week.zone,
                  startDate: home.week.startDate,
                  ...(home.week.chequesWaiting !== undefined
                      ? { chequesWaiting: home.week.chequesWaiting }
                      : {}),
              }
            : null,
    };
}

/**
 * "Finish setup" (F8). Throws when the settings can't be read: the
 * checklist is then left off Home, never Home itself.
 */
export async function readHomeSetup(): Promise<HomeSetup> {
    const settings = await getOrganizationSettings();
    if (!settings) throw new Error("Home setup: settings unread");
    // The 4 first steps lead until done (#1194); the money card then.
    const [list, seen, modules] = await Promise.all([
        loadReadyChecklist(settings),
        getSeenMoments(),
        homeModules(),
    ]);
    const first = firstSteps({
        settings,
        modules,
        shared: seen?.has("shared-booking-link") ?? false,
    });
    // The link the share step hands over, read only while it is left.
    const share =
        first.shares && first.steps.some((s) => s.key === "share" && !s.done)
            ? shareLink(await readWebAddressLinks(), [first.shares])
            : null;
    return { list, businessId: settings.id, first, share };
}

/** Home's reads take no params. */
type HomeParams = Parameters<typeof homeRead.key>[1];

export const homeServer: ServerRead<HomeParams, HomeModel> = {
    read: homeRead,
    service: readHomeScreen,
};

export const homeSetupServer: ServerRead<HomeParams, HomeSetup> = {
    read: homeSetupRead,
    service: readHomeSetup,
};
