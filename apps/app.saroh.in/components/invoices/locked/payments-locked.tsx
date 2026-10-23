import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import Link from "next/link";

import type { LockedCopy } from "@/lib/invoices/access";

/**
 * Payments' locked card (D18), after the Invoices, Invoice Detail and
 * Subscriptions designs: why this role can't open it, who can change that,
 * and the way back. Nothing is read for it, and there is nothing to retry.
 * Drawn like Order Detail's (`OrderLocked`). It stands in for the whole
 * page, so it is the page's `main`, as `PageContainer` would be.
 */
export function PaymentsLocked({ title, text }: LockedCopy) {
    return (
        <main className="w-full px-4 py-[60px] sm:px-[22px]">
            <PermissionDeniedState
                data-ph-unmask=""
                className="gap-[9px] border-border-strong py-9 sm:py-9"
                title={title}
                description={text}
                action={
                    <Button asChild variant="outline" className="wk-press mt-1">
                        <Link href="/">Back to Home</Link>
                    </Button>
                }
            />
        </main>
    );
}
