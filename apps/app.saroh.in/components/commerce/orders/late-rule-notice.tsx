import { getLateRuleNotices } from "@/lib/stores/storefronts";

import { LateRuleNoticeCard } from "./late-rule-notice-card";

/**
 * Orders' one-time notice about the new Pick-up default (plan B, B17): ONE
 * notice naming every storefront that had pick-up orders in the last 30
 * days and is still on it (finding 9: one per storefront stacked above the
 * list, and on a phone pushed the first order below the fold). Only for
 * someone who can change the rule (`store:update`): a notice nobody can
 * act on is noise. Reads its own data, so Orders mounts it with one line
 * above the list. Nothing shows when it can't be read: the list matters
 * more.
 */
export async function LateRuleNotice() {
    const read = await getLateRuleNotices();
    if (!read || !read.canChange || read.notices.length === 0) return null;
    return <LateRuleNoticeCard notices={read.notices} />;
}
