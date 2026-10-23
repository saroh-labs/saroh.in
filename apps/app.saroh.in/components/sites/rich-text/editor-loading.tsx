import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";

/**
 * The text editor while its code arrives: the one loading drawing (the
 * sweep), at the editor's own height, and said once to a screen reader.
 */
export function EditorLoading({ className }: { className?: string }) {
    return (
        <div role="status" aria-busy="true">
            <span className="sr-only">Loading the editor</span>
            <Skeleton aria-hidden className={cn("w-full", className)} />
        </div>
    );
}
