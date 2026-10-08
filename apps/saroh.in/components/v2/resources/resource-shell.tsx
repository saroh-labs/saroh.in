import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * A Resources page with a side nav (plan U1): the topics on the left from
 * 900px (a "Topics" menu above the page below that), the page in the
 * middle, and "On this page" on the right from 1100px. Give it `SideNav`,
 * the page, and `OnThisPage`.
 */
export function ResourceShell({
    side,
    aside,
    children,
    className,
}: {
    side: ReactNode;
    aside?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "mx-auto grid w-full max-w-mk-page items-start gap-6 px-mk-gutter pt-10 min-[900px]:grid-cols-[220px_minmax(0,1fr)] min-[900px]:gap-10 min-[1100px]:grid-cols-[220px_minmax(0,1fr)_200px]",
                className,
            )}
        >
            {side}
            <div className="min-w-0">{children}</div>
            {aside}
        </div>
    );
}
