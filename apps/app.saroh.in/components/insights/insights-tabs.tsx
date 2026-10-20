import { Badge } from "@saroh/ui/badge";
import { TabStrip } from "@saroh/ui/tabs";

import type { InsightsAddress, InsightsTab } from "@/lib/insights/period";
import { INSIGHTS_TABS, insightsHref, TAB_LABEL } from "@/lib/insights/period";

/**
 * Insights' tabs (DEC-171, plan U10, #1089; `IBOverviewD`, `IBOverviewP`):
 * Overview, Money, What sells and Where customers come from, each an
 * address that keeps the period and the website chosen, so moving between
 * tabs never changes the days shown. The last is marked Next until where a
 * visit came from is tracked (A9, U15 and U16).
 *
 * The one tab look (`TabStrip`): on a phone the strip scrolls sideways
 * inside itself, and nothing else on the page does.
 */
export function InsightsTabs({ address }: { address: InsightsAddress }) {
    return (
        <TabStrip<InsightsTab>
            label="Insights"
            value={address.tab}
            tabs={INSIGHTS_TABS.map((tab) => ({
                value: tab,
                label: TAB_LABEL[tab],
                href: insightsHref({ ...address, tab }),
                ...(tab === "from" ? { extra: <NextMark /> } : {}),
            }))}
        />
    );
}

/** "Next": what the tab will show is still coming (A9). */
function NextMark() {
    return (
        <Badge variant="warning" size="sm" className="px-1.5 font-bold">
            Next
        </Badge>
    );
}
