import { count } from "@/lib/format/plural";
import { pendingChangeCount } from "@/lib/sites/pending";
import type { SiteSummary } from "@/lib/sites/service";
import type { SiteStateTone } from "@/lib/sites/site-state";

/**
 * A site's status in the Website area's words (RULES §1, plan
 * 2026-11-18-001 U3): "Live", "Live · 2 changes waiting", "Not live yet".
 * The header chip, the switcher, the All sites cards and the phone bar read
 * this one answer, so the count is the same number everywhere (RULES §2).
 *
 * `waiting` is the count the phone bar shows; 0 for someone who reads the
 * site (DEC-200: they are told whether it is live, never what waits).
 * Today's tabs keep `siteState`, whose words are their own.
 */
export function siteStatus(
    site: Pick<
        SiteSummary,
        | "currentPublicationId"
        | "pendingSectionChanges"
        | "pendingSiteChanges"
        | "hasUnpublishedChanges"
    >,
    { reader = false }: { reader?: boolean } = {},
): { label: string; tone: SiteStateTone; waiting: number } {
    if (!site.currentPublicationId) {
        return { label: "Not live yet", tone: "draft", waiting: 0 };
    }
    if (reader) return { label: "Live", tone: "live", waiting: 0 };
    const waiting = pendingChangeCount(
        site.pendingSectionChanges,
        site.pendingSiteChanges,
    );
    if (waiting > 0) {
        return {
            label: `Live · ${count(waiting, "change")} waiting`,
            tone: "attention",
            waiting,
        };
    }
    // Something waits that no count covers: true, and no number invented.
    if (site.hasUnpublishedChanges) {
        return { label: "Live · changes waiting", tone: "attention", waiting };
    }
    return { label: "Live", tone: "live", waiting: 0 };
}
