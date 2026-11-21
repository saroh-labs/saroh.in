import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * When a save goes live, said the same way on every Website sheet (RULES
 * §2, plan KTD-8). A closed list: a new exception is a new line here, said
 * on its own button, never words a sheet makes up.
 */
export const SAVE_LINES = {
    // Before anything is saved (a sheet's Cancel and Save, a page at rest):
    // "Saved" only ever follows a real save (editor audit, 21 Nov).
    "on-publish": "Goes live when you publish",
    "waits-for-publish": "Saved · goes live when you publish",
    // An open sheet whose thing already has changes waiting (Page settings).
    "changed-waits": "Changed · goes live when you publish",
    "post-goes-live-alone": "Goes live now, on its own",
    "from-your-code": "Goes live from your code",
    // The price sheet (U48, O1): a price lives on the service, not the draft.
    "goes-live-now": "Saved in Services · shows here at once",
    "shows-now": "Shows on your site now",
} as const;

export type SaveLine = keyof typeof SAVE_LINES;

/**
 * A sheet's foot: its one line, then its buttons (Cancel, Save). The line
 * says when a save goes live; "Saved · …" only once a save has happened.
 */
export function SaveFooter({
    line = "on-publish",
    children,
    className,
}: {
    line?: SaveLine;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            data-save-footer={line}
            className={cn(
                "flex flex-wrap items-center justify-end gap-x-3 gap-y-2",
                className,
            )}
        >
            <p className="mr-auto min-w-0 text-sm text-muted-foreground">
                {SAVE_LINES[line]}
            </p>
            {children}
        </div>
    );
}
