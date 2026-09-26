import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";

import type { PillVariant } from "@/lib/invoices/status";

/**
 * An invoice's status as the Invoices design draws it: a small uppercase
 * pill that always says the status in words — colour only backs it up.
 */
export function InvoicePill({
    label,
    variant,
    className,
}: {
    label: string;
    variant: PillVariant;
    className?: string;
}) {
    return (
        <Badge
            variant={variant}
            className={cn(
                "whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold uppercase leading-[1.35] tracking-[0.04em]",
                className,
            )}
        >
            {label}
        </Badge>
    );
}
