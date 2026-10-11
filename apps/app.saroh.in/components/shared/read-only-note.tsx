import { cn } from "@saroh/ui/lib/utils";

import { whoCanChangeLine } from "@/components/shared/who-can-change";
import { Notice } from "@saroh/ui/notice";

/**
 * The one read-only treatment: a quiet note above what a role can see but not
 * change. A thin wrapper over `Notice`, kept for its wording.
 *
 * Promoted from product settings so every read-only screen says it the same
 * way (plan 2026-09-23-003, R20) — a note, not a disabled form: nothing on the
 * page pretends to be editable, and the reader is told who can change what
 * their role reaches. `children` replaces the first sentence where a screen
 * holds something other than settings ("Your role can read this invoice but
 * not change it."); who can change it is `whoCanChangeLine`, the same
 * sentence everywhere.
 */
export function ReadOnlyNote({
    children = "Your role can read these settings but not change them.",
    className,
    id,
    ownerOnly = false,
}: {
    children?: React.ReactNode;
    /** What only the owner changes: the note says so. */
    ownerOnly?: boolean;
    className?: string;
    /** For a disabled control the note explains (`aria-describedby`). */
    id?: string;
}) {
    return (
        <Notice
            id={id}
            icon={false}
            // Saroh's own words: a session recording may read them.
            data-ph-unmask=""
            className={cn("mb-3.5", className)}
        >
            {children} {whoCanChangeLine(ownerOnly)}
        </Notice>
    );
}
