import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * The gallery's browser frame (Templates design): 14px corners, a hairline,
 * and a bar with three dots and the site's address in mono. The address is
 * the sample business's, so the frame reads as a site, not a picture.
 */
export function BrowserFrame({
    host,
    children,
    className,
}: {
    host: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "min-w-0 overflow-hidden rounded-[14px] border border-border bg-card",
                className,
            )}
        >
            <div className="flex items-center gap-3 border-b border-border bg-background px-3.5 py-2.5">
                <span aria-hidden className="flex gap-1.5">
                    <span className="size-2 rounded-full bg-border-strong" />
                    <span className="size-2 rounded-full bg-border-strong" />
                    <span className="size-2 rounded-full bg-border-strong" />
                </span>
                <span className="min-w-0 truncate font-mono text-[12px] text-muted-foreground">
                    {host}
                </span>
            </div>
            {children}
        </div>
    );
}
