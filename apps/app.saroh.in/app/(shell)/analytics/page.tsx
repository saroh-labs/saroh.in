import { PageHeader } from "@saroh/ui/page-header";
import { forbidden } from "next/navigation";

import { MoneyTab } from "@/components/insights/money/money-tab";
import { InsightsTabs } from "@/components/insights/overview/insights-tabs";
import { Overview } from "@/components/insights/overview/overview";
import type { PeriodChoice } from "@/components/insights/overview/period-control";
import {
    PeriodSegments,
    PeriodSheet,
} from "@/components/insights/overview/period-control";
import { SuggestionCard } from "@/components/insights/overview/suggestion-card";
import { SellsTab } from "@/components/insights/sells/sells-tab";
import { FromTab } from "@/components/insights/where-from/from-tab";
import type { SiteOption } from "@/components/insights/where-from/site-picker";
import { PageContainer } from "@/components/shared/page/page-container";
import {
    readLinks,
    readMoney,
    readSells,
    readSiteChoices,
    readSources,
    readSuggestions,
    readTraffic,
    summarizeAnalytics,
} from "@/lib/analytics/service";
import type { SourceRead } from "@/lib/analytics/takings";
import { ApiError } from "@/lib/api/errors";
import { businessZone } from "@/lib/format/business-zone";
import { localDateKey } from "@/lib/format/datetime";
import type { InsightsAddress, PeriodWindow } from "@/lib/insights/period";
import {
    INSIGHTS_PERIODS,
    insightsHref,
    periodChoiceLine,
    periodLine,
    periodWindow,
    readAddress,
} from "@/lib/insights/period";
import type { SellsParts } from "@/lib/insights/sells-words";
import { listModules } from "@/lib/modules/service";
import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import {
    ORDERS_FIRST_RUN,
    shareLink,
    siteAddressOf,
} from "@/lib/sites/share-links";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";

/**
 * A page title is how a merchant with six tabs open finds this one.
 * Without it the tab reads the bare default, "Saroh", on every route.
 */
export const metadata = { title: "Insights" };

/**
 * Insights (DEC-171, plan U10, #1089), "Overview and tabs": one period for
 * the whole page, kept in the address with the tab
 * (`?period=7d|4w|3m&tab=overview|money|sells|from`, `lib/insights/period.ts`),
 * the line under the title naming the days and what they are set against,
 * and the tabs: Overview (one suggestion, three answers), Money, What sells
 * and Where customers come from.
 *
 * Each tab reads only what it shows, and a tab's read that fails is said
 * there, by name, with Try again. A role without Insights is denied the
 * page (`forbidden()`, the shell's denied page); a role with Insights and
 * without payments sees counts and is told who can show them money.
 *
 * Money reads the period (U12, #1093, `money-tab.tsx`), and so does What
 * sells (U13, #1095, `sells-tab.tsx`). Where customers come from holds
 * the website figures for the period, with a site picker (U14, #1097,
 * `from-tab.tsx`), and the path from visit to paid and where visitors come
 * from (U16, #1101), which the Overview's third answer reads too.
 */
export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams?: Promise<{
        period?: string;
        tab?: string;
        range?: string;
        siteId?: string;
    }>;
}) {
    await requireSession();

    const address = readAddress((await searchParams) ?? {});
    const organization = await activeOrganizationOnce().catch(() => null);
    // A role the API says has no Insights read never gets the page. An
    // older API that sends no permissions is left to the reads below.
    if (
        organization?.actions &&
        !organization.actions.includes("analytics:read")
    ) {
        forbidden();
    }
    const today = localDateKey(new Date(), businessZone(organization));
    const window = periodWindow(address.period, today);
    const choices: PeriodChoice[] = INSIGHTS_PERIODS.map((period) => ({
        period,
        href: insightsHref({ ...address, period }),
        line: periodChoiceLine(period, periodWindow(period, today)),
    }));

    const body = tabBody(address, window, today, {
        canRemind: permits(organization, "invoice:write"),
        canTakeOrder: permits(organization, "order:create"),
        canAddService: permits(organization, "service:write"),
        canMakeLinks: permits(organization, "site:update"),
    });

    return (
        <PageContainer width="full">
            <div className="flex max-w-[1160px] flex-col gap-5">
                <PageHeader
                    title="Insights"
                    holdsData={false}
                    // On a phone the period's button sits on the title's
                    // line (`IBOverviewP`) and the desk's three are hidden.
                    className="!mb-0 max-desk:[&_[data-slot=page-badge]]:ml-auto max-desk:[&_[data-slot=page-side]]:hidden"
                    description={
                        <>
                            {periodLine(address.period, window)}
                            <span className="max-desk:hidden">
                                {" "}
                                · updated every hour
                            </span>
                        </>
                    }
                    badge={
                        <PeriodSheet
                            value={address.period}
                            choices={choices}
                            className="desk:hidden"
                        />
                    }
                    actions={
                        <PeriodSegments
                            value={address.period}
                            choices={choices}
                        />
                    }
                />
                <InsightsTabs address={address} />
                {body}
            </div>
        </PageContainer>
    );
}

/** The open tab, read for the period. */
function tabBody(
    address: InsightsAddress,
    window: PeriodWindow,
    today: string,
    can: {
        canRemind: boolean;
        canTakeOrder: boolean;
        canAddService: boolean;
        canMakeLinks: boolean;
    },
) {
    switch (address.tab) {
        case "money":
            return <MoneyPart address={address} canRemind={can.canRemind} />;
        case "sells":
            return (
                <SellsPart
                    address={address}
                    can={{
                        takeOrder: can.canTakeOrder,
                        addService: can.canAddService,
                    }}
                />
            );
        case "from":
            return (
                <FromPart
                    address={address}
                    window={window}
                    today={today}
                    canMakeLinks={can.canMakeLinks}
                />
            );
        default:
            return <OverviewTab address={address} window={window} />;
    }
}

/**
 * Every website's rows for some days: a website is chosen when the rows
 * are folded (`summarizeAnalytics`), because paid orders are written for
 * the whole business and a per-site read would leave them out.
 */
function trafficFor(from: string, to: string) {
    return readTraffic({ from, to });
}

async function OverviewTab({
    address,
    window,
}: {
    address: InsightsAddress;
    window: PeriodWindow;
}) {
    const [money, sells, traffic, suggestions, sources] = await Promise.all([
        readMoney(address.period),
        readSells(address.period),
        trafficFor(window.from, window.to),
        readSuggestions(address.period),
        readSources(address.period, address.siteId),
    ]);
    // Without Insights' own reads the page is not theirs (#274). Outside
    // any try, so the interrupt lands.
    if (traffic.status === "denied" || sells?.status === "denied") {
        forbidden();
    }
    // Nothing at all could be read: the segment boundary's, with Try again.
    if (
        traffic.status === "failed" &&
        sells?.status !== "ok" &&
        money?.status !== "ok"
    ) {
        throw new ApiError(503, "GET analytics");
    }
    const website: SourceRead<
        ReturnType<typeof summarizeAnalytics>["summary"]
    > =
        traffic.status === "ok"
            ? {
                  status: "ok",
                  data: summarizeAnalytics(traffic.data, {
                      siteId: address.siteId,
                  }).summary,
              }
            : { status: "failed" };
    // Before the first sale the card copies the live shop (else website)
    // link; only then is the web address read (`IBNoSalesD`).
    const firstSale =
        suggestions?.status === "ok" &&
        suggestions.data.suggestions.some((s) => s.rule === "FIRST_SALE");
    const share = firstSale
        ? shareLink(await readWebAddressLinks(), ORDERS_FIRST_RUN)
        : null;
    return (
        <Overview
            address={address}
            money={money}
            sells={sells}
            website={website}
            sources={sources}
            suggestion={<SuggestionCard read={suggestions} share={share} />}
        />
    );
}

/** Money for the period (U12, #1093). */
async function MoneyPart({
    address,
    canRemind,
}: {
    address: InsightsAddress;
    canRemind: boolean;
}) {
    const money = await readMoney(address.period);
    return (
        <MoneyTab
            money={money}
            retryHref={insightsHref(address)}
            canRemind={canRemind}
        />
    );
}

/**
 * What sells for the period (U13, #1095): best sellers only where the
 * business sells and bookings only where it books, read from what is
 * turned on (a failed read shows both).
 */
async function SellsPart({
    address,
    can,
}: {
    address: InsightsAddress;
    can: { takeOrder: boolean; addService: boolean };
}) {
    const [sells, modules] = await Promise.all([
        readSells(address.period),
        listModules().catch(() => null),
    ]);
    if (sells?.status === "denied") forbidden();
    const on =
        modules && modules.length > 0
            ? new Set(
                  modules
                      .filter((m) => m.readiness !== "DISABLED")
                      .map((m) => m.key),
              )
            : null;
    const parts: SellsParts | null = on
        ? { sells: on.has("COMMERCE"), books: on.has("APPOINTMENTS") }
        : null;
    return (
        <SellsTab
            sells={sells}
            retryHref={insightsHref(address)}
            parts={parts}
            can={can}
        />
    );
}

/**
 * Where customers come from: the website's figures for the period and
 * the period before, for the website chosen (U14, #1097), and where the
 * visits came from (U16, #1101). The reads go together; each that fails
 * is named on the tab.
 */
async function FromPart({
    address,
    window,
    today,
    canMakeLinks,
}: {
    address: InsightsAddress;
    window: PeriodWindow;
    today: string;
    canMakeLinks: boolean;
}) {
    const [traffic, earlier, sites, links, sourcesRead, madeRead] =
        await Promise.all([
            trafficFor(window.from, window.to),
            trafficFor(window.beforeFrom, window.beforeTo),
            readSiteChoices(),
            readWebAddressLinks(),
            readSources(address.period, address.siteId),
            readLinks(address.period, address.siteId),
        ]);
    if (traffic.status === "denied") forbidden();
    const list = sites.status === "ok" ? sites.data : null;
    // A website no longer the business's (or never) reads as all of them.
    const siteId =
        address.siteId && (!list || list.some((s) => s.id === address.siteId))
            ? address.siteId
            : null;
    const fold = { siteId, from: window.from, to: window.to };
    // A website no longer the business's reads as all of them, sources too.
    const [sources, made] =
        siteId === address.siteId
            ? [sourcesRead, madeRead]
            : await Promise.all([
                  readSources(address.period, siteId),
                  readLinks(address.period, siteId),
              ]);
    // Each website's real address, as every share link reads it, for the
    // links made in Saroh to copy (DEC-181).
    const linkSites = (list ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        url: siteAddressOf(s, links, RENDERER_APEX)?.url ?? null,
    }));
    const options: SiteOption[] | null = list
        ? [
              {
                  id: null,
                  name: "All your sites",
                  line: "Every website together",
                  href: insightsHref({ ...address, siteId: null }),
              },
              ...list.map((s) => ({
                  id: s.id,
                  name: s.name,
                  line:
                      siteAddressOf(s, links, RENDERER_APEX)?.host ??
                      "No address yet",
                  href: insightsHref({ ...address, siteId: s.id }),
              })),
          ]
        : null;
    return (
        <FromTab
            period={address.period}
            window={window}
            current={
                traffic.status === "ok"
                    ? {
                          status: "ok",
                          data: summarizeAnalytics(traffic.data, fold),
                      }
                    : { status: "failed" }
            }
            before={
                earlier.status === "ok"
                    ? {
                          status: "ok",
                          data: summarizeAnalytics(earlier.data, { siteId })
                              .summary,
                      }
                    : { status: "failed" }
            }
            sites={options}
            sitesFailed={sites.status === "failed"}
            siteId={siteId}
            retryHref={insightsHref({ ...address, siteId })}
            sources={sources}
            links={made}
            linkSites={linkSites}
            canMakeLinks={canMakeLinks}
            today={today}
        />
    );
}
