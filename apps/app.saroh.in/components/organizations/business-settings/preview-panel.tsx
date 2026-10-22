import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * A preview of what a setting looks like to a customer ("How it prints",
 * "What customers see"): beside the rows it shows what is saved; in a
 * sheet, under the fields, it follows what is being typed.
 */
export function PreviewPanel({
    label,
    live,
    placement,
    className,
    children,
}: {
    label: string;
    /** Drawn from a draft: say the preview shows the unsaved edit. */
    live: boolean;
    placement: "beside" | "in-sheet";
    /** Its width beside the rows. */
    className?: string;
    children: ReactNode;
}) {
    return (
        <aside
            aria-label={label}
            className={cn(
                "grid gap-2",
                placement === "in-sheet"
                    ? "mt-3 border-t border-border pt-4"
                    : "min-w-[260px] self-start min-[1100px]:sticky min-[1100px]:top-4",
                placement === "beside" && className,
            )}
        >
            <div className="flex items-baseline gap-2">
                <span className="label">{label}</span>
                {live ? (
                    <span className="text-[11.5px] text-foreground">
                        Showing your unsaved edit
                    </span>
                ) : null}
            </div>
            {children}
        </aside>
    );
}
