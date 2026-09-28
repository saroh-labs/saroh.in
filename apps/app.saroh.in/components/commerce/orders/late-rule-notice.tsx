import { getLateRuleNotices } from "@/lib/stores/storefronts";

import { LateRuleNoticeCard } from "./late-rule-notice-card";

/**
 * Orders' one-time notice about the new Pick-up default (plan B, B17), one
 * per storefront that had pick-up orders in the last 30 days and is still
 * on it. Reads its own data, so Orders mounts it with one line above the
 * list. Nothing shows when it can't be read: the list matters more.
 */
export async function LateRuleNotice() {
    const read = await getLateRuleNotices();
    if (!read || read.notices.length === 0) return null;
    return (
        <>
            {read.notices.map((notice) => (
                <LateRuleNoticeCard
                    key={notice.storeId}
                    notice={notice}
                    canChange={read.canChange}
                />
            ))}
        </>
    );
}
