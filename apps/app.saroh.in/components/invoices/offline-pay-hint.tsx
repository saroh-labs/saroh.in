import Link from "next/link";

import { offlinePayHint } from "@/lib/invoices/offline-hint";
import type { OnlineBlocker } from "@/lib/staff/types";

const LINK =
    "font-medium text-foreground underline underline-offset-4 hover:decoration-2 active:text-muted-foreground";

/**
 * The Payment panel's line when an unpaid invoice's link can't take
 * payment (DEC-070): why, and the fix where the merchant has one. Where the
 * plan is the blocker (#835) it says online payment comes with a paid plan
 * and links to the plans, never "Connect a payment provider" — connecting
 * one would change nothing. The words are `offlinePayHint`'s.
 */
export function OfflinePayHint(props: {
    blocker: OnlineBlocker | null;
    paymentsOn: boolean;
    providerConnected: boolean;
    canWrite: boolean;
    who: string;
}) {
    const hint = offlinePayHint(props);
    return (
        <p className="mt-2 text-[12.5px] leading-[1.5] text-muted-foreground">
            {hint.text}
            {hint.fix && props.canWrite ? (
                <>
                    {" "}
                    <Link href={hint.fix.href} className={LINK}>
                        {hint.fix.label}
                    </Link>
                </>
            ) : null}
        </p>
    );
}
