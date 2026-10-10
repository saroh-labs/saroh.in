import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { LimitReachedCard } from "@/components/billing/plan-way";
import type { PlanMeter } from "@/lib/billing/meter";

/**
 * New product at the plan's product limit (UX-036): said before the form,
 * with the way to more and back to the list — never the full editor,
 * refused on Create.
 */
export function ProductLimitReached({ meter }: { meter: PlanMeter }) {
    return (
        <LimitReachedCard
            title={`You're at ${meter.label}`}
            description="Archive or delete one to make room, or move to a plan with more."
            plan={meter.upgradeTo}
            href={meter.href}
            secondary={
                <Button asChild variant="outline" className="wk-press">
                    <Link href="/commerce/products">Back to Products</Link>
                </Button>
            }
        />
    );
}
