import "server-only";

import { cache } from "react";

import type { HomeSetup } from "@/components/home/dashboard/home-setup";
import { hasAnyInvoice } from "@/lib/invoices/service";
import { listModules } from "@/lib/modules/service";
import { homeMoment, homeNewFeature } from "@/lib/moments/read";
import { getSeenMoments } from "@/lib/moments/service";
import type { OrganizationKind } from "@/lib/organizations/kind";
import { firstRunOrder, INVOICE_JOB, kindOf } from "@/lib/organizations/kind";
import type { Organization } from "@/lib/organizations/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import type { ServerRead } from "@/lib/query/route";
import { firstSteps, mayFinishSetup } from "@/lib/settings/ready";
import { loadReadyChecklist } from "@/lib/settings/ready-service";
import { shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";

import type { InvoiceJobFacts } from "./first-run";
import { mayWriteInvoices } from "./first-run";
import type { HomeScreen } from "./queries";
import { homeRead, homeSetupRead } from "./queries";
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
 * figures besides cheques waiting), so the browser isn't sent them; and
 * what Home says from it, each read only when it can be said (a
 * Reviewer's Home reads nothing more).
 */
export async function readHomeScreen(): Promise<HomeScreen> {
    const [home, business] = await Promise.all([
        getHome(),
        activeOrganizationOnce(),
    ]);
    const screen = {
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
    if (home.view === "reviewer")
        return { ...screen, moment: null, news: null };
    const own = home.view !== "staff";
    // The first order or booking, in its first day (wave G), said once,
    // above the work: the business's Home only.
    const moment =
        own && home.hasAnyModule ? await homeMoment(home, business) : null;
    // Else one new feature, only while nothing else holds the slot (a
    // part that couldn't load): one message at a time, never stacked.
    const news =
        home.hasAnyModule && !moment && home.unavailable.length === 0
            ? await homeNewFeature(business)
            : null;
    const invoicing =
        own && !home.hasAnyModule
            ? await loadInvoicing(business, kindOf(business?.kind))
            : undefined;
    return { ...screen, moment, news, ...(invoicing ? { invoicing } : {}) };
}

/**
 * "Invoice a client" (DEC-070), for a kind whose first run offers it: to
 * someone who may write invoices, until the business has one. The invoice
 * read happens only then, and a read that fails leaves the card offered.
 */
async function loadInvoicing(
    business: Organization | null,
    kind: OrganizationKind,
): Promise<InvoiceJobFacts | undefined> {
    if (!firstRunOrder(kind).includes(INVOICE_JOB)) return undefined;
    if (!mayWriteInvoices(business))
        return { mayWrite: false, hasInvoice: null };
    return { mayWrite: true, hasInvoice: await hasAnyInvoice() };
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

export const homeServer: ServerRead<HomeParams, HomeScreen> = {
    read: homeRead,
    service: readHomeScreen,
};

export const homeSetupServer: ServerRead<HomeParams, HomeSetup> = {
    read: homeSetupRead,
    service: readHomeSetup,
};
