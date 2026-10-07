import { Button } from "@saroh/ui/button";
import { CapabilityOffState } from "@saroh/ui/data-state";
import { Lock } from "lucide-react";
import Link from "next/link";

import type { PlanMeter } from "@/lib/billing/meter";

/**
 * New product at the plan's product limit (UX-036): said before the form,
 * with the way to more and back to the list — never the full editor,
 * refused on Create.
 */
export function ProductLimitReached({ meter }: { meter: PlanMeter }) {
    return (
        <CapabilityOffState
            icon={<Lock />}
            title={`You're at ${meter.label}`}
            description={`${meter.reason ?? ""} Archive or delete one to make room, or move to a plan with more.`}
            action={
                <div className="flex flex-wrap gap-2">
                    <Button asChild>
                        <Link href={meter.href}>
                            {meter.upgradeTo
                                ? `Upgrade to ${meter.upgradeTo}`
                                : "See plans"}
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/commerce/products">Back to products</Link>
                    </Button>
                </div>
            }
        />
    );
}
