import { FailedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { forbidden } from "next/navigation";

import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { InsightsTabs } from "@/components/insights/insights-tabs";
import { MoneyTab } from "@/components/insights/money-tab";
import { Overview } from "@/components/insights/overview";
import type { PeriodChoice } from "@/components/insights/period-control";
import {
    PeriodSegments,
    PeriodSheet,
} from "@/components/insights/period-control";
import { SellsTab } from "@/components/insights/sells-tab";
import { SuggestionCard } from "@/components/insights/suggestion-card";
import { PageContainer } from "@/components/shared/page-container";
import {
    readMoney,
    readSells,
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
    PERIOD_LABEL,
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
import { ORDERS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import { couldntLoad } from "@saroh/ui/lib/state-copy";

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
 * sells (U13, #1095, `sells-tab.tsx`). Until its own unit lands, Where
 * customers come from is today's website figures for the chosen period
 * (U14, #1097): nothing that Insights showed before is out of reach.
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

    const body = tabBody(address, window, {
        canRemind: permits(organization, "invoice:write"),
        canTakeOrder: permits(organization, "order:create"),
        canAddService: permits(organization, "service:write"),
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
    can: { canRemind: boolean; canTakeOrder: boolean; canAddService: boolean },
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
            return <FromTab address={address} window={window} />;
        default:
            return <OverviewTab address={address} window={window} />;
    }
}

function trafficFor(address: InsightsAddress, window: PeriodWindow) {
    return readTraffic({
        from: window.from,
        to: window.to,
        ...(address.siteId ? { siteId: address.siteId } : {}),
    });
}

async function OverviewTab({
    address,
    window,
}: {
    address: InsightsAddress;
    window: PeriodWindow;
}) {
    const [money, sells, traffic, suggestions] = await Promise.all([
        readMoney(address.period),
        readSells(address.period),
        trafficFor(address, window),
        readSuggestions(address.period),
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
            ? { status: "ok", data: summarizeAnalytics(traffic.data).summary }
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
 * Where customers come from: today's website figures, for the page's
 * period, until sources are tracked (U14 to U16).
 */
async function FromTab({
    address,
    window,
}: {
    address: InsightsAddress;
    window: PeriodWindow;
}) {
    const traffic = await trafficFor(address, window);
    if (traffic.status === "denied") forbidden();
    return (
        <section aria-labelledby="website-heading" className="space-y-4">
            <div className="min-w-0">
                <h2
                    id="website-heading"
                    className="font-display text-[19px] font-semibold tracking-[-0.025em]"
                >
                    Your website
                </h2>
                <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
                    {PERIOD_LABEL[address.period]}: visits, visitors, enquiries
                    and paid orders. Updated every hour.
                </p>
            </div>
            {traffic.status === "ok" ? (
                <AnalyticsDashboard
                    view={summarizeAnalytics(traffic.data)}
                    range={{
                        from: window.from,
                        to: window.to,
                        label: PERIOD_LABEL[address.period]
                            .replace(/^Last /, "")
                            .toLowerCase(),
                    }}
                />
            ) : (
                <FailedState
                    size="panel"
                    title={couldntLoad("your website's figures")}
                    retryHref={insightsHref(address)}
                />
            )}
        </section>
    );
}
