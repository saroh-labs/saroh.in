import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * "Sell › Stock", the title and its line, and the screen's buttons — the
 * design's header (24px Space Grotesk, the line under it in muted 13px).
 */
export function StockHeader({
    subline,
    actions,
}: {
    subline: string | null;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3">
            <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-2 text-[12px] text-muted-foreground"
            >
                <span>Sell</span>
                <ChevronRight aria-hidden className="size-3" />
                <span className="text-foreground">Stock</span>
            </nav>
            <div className="flex flex-wrap items-end gap-3.5">
                <div className="min-w-0 flex-[1_1_280px]">
                    <h1 className="font-display text-[24px] font-semibold leading-[1.1] tracking-[-0.025em]">
                        Stock
                    </h1>
                    {subline ? (
                        <p className="mt-1 text-pretty text-[13px] text-muted-foreground">
                            {subline}
                        </p>
                    ) : null}
                </div>
                {actions ? (
                    <div className="flex flex-wrap gap-2">{actions}</div>
                ) : null}
            </div>
        </div>
    );
}
