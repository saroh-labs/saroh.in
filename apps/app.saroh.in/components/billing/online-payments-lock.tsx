import { onlinePaymentsLock } from "@/lib/billing/access";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";

import { LimitNoticeBlock } from "./limit-notice";

/**
 * The plan's stop on taking money online, said on the screen where it bites
 * (Settings › Providers, Subscriptions): the notice block the limit notices
 * use, with the way up. Nothing while locks aren't enforced or when the plan
 * can't be read — the API still refuses the write (`MODULE_LOCKED`) and the
 * refusal dialog says why. A client screen that reads the lock itself
 * (Subscriptions) draws `LimitNoticeBlock` with `onlinePaymentsLock`'s words.
 */
export async function OnlinePaymentsLockNotice({
    what,
    className,
}: {
    what: "payments" | "subscriptions";
    className?: string;
}) {
    const lock = onlinePaymentsLock(await billingAccessOrNull(), what);
    if (!lock) return null;
    return (
        <LimitNoticeBlock
            full={false}
            title={lock.title}
            body={lock.body}
            cta={lock.cta}
            href={lock.href}
            className={className}
        />
    );
}
