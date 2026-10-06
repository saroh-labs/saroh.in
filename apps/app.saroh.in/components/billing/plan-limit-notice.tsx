import { accessRow, rowNotice, upgradeHref } from "@/lib/billing/access";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";

import { LimitNoticeBlock } from "./limit-notice";

/**
 * The 80% / 100% notice for one of the plan's limits, on the screen where it
 * bites (plans catalogue U14): Products, Orders, Bookings, Blog, Team,
 * Integrations. Nothing under 80%, nothing while limits aren't enforced,
 * and nothing when the plan can't be read — the notice is an aid; the API
 * still refuses the write and says why.
 */
export async function PlanLimitNotice({
    moduleId,
    className,
}: {
    /** The catalogue row: "products", "orders", "bookings", "blog", "members", "integrations". */
    moduleId: string;
    className?: string;
}) {
    const view = await billingAccessOrNull();
    const n = rowNotice(view, moduleId);
    if (!n.on) return null;
    return (
        <LimitNoticeBlock
            full={n.full}
            soft={n.soft}
            title={n.title}
            pct={n.pct}
            body={n.body}
            cta={n.cta}
            href={upgradeHref(accessRow(view, moduleId)?.upgradeTo?.planId)}
            className={className}
        />
    );
}
