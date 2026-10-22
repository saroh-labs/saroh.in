import { TabStrip } from "@saroh/ui/tabs";

import type { InsightsAddress, InsightsTab } from "@/lib/insights/period";
import { INSIGHTS_TABS, insightsHref, TAB_LABEL } from "@/lib/insights/period";

/**
 * Insights' tabs (DEC-171, plan U10, #1089; `IBOverviewD`, `IBOverviewP`):
 * Overview, Money, What sells and Where customers come from, each an
 * address that keeps the period and the website chosen, so moving between
 * tabs never changes the days shown. Where customers come from was marked
 * Next until where a visit came from was tracked and shown (A9; U15
 * #1099, U16 #1101); nothing on it is still to come, so no tab is marked.
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
            }))}
        />
    );
}
