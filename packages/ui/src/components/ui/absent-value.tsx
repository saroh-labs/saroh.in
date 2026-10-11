import * as React from "react";

import { ABSENT_MARK, isAbsentText } from "../../lib/absent";
import { cn } from "../../lib/utils";

export interface AbsentValueProps extends Omit<
    React.HTMLAttributes<HTMLSpanElement>,
    "children"
> {
    /**
     * What a screen reader hears in place of the dash: "None" (there are
     * none), "Not set" (nobody has filled it in), "Not known" (it couldn't
     * be read or worked out), "Not yet", "Not recorded".
     */
    says?: string;
}

/**
 * A value that isn't there, in a table cell, a stat tile, a row's meta, a
 * code cell, a quick look or a summary: a muted dash to the eye and a word
 * to a screen reader. It is Saroh's own mark, never a record's data, so a
 * session recording may read it (a masked cell around it still wins).
 *
 * Not for a Settings read row, where the words "Not set" beside the row's
 * Edit button are the invitation to set it, and not for a sentence.
 */
export function AbsentValue({
    says = "None",
    className,
    ...props
}: AbsentValueProps) {
    return (
        <span
            data-absent=""
            data-ph-unmask=""
            className={cn("text-muted-foreground", className)}
            {...props}
        >
            <span aria-hidden="true">{ABSENT_MARK}</span>
            <span className="sr-only">{says}</span>
        </span>
    );
}

/**
 * Draws what it is given, or `AbsentValue` when that is nothing: `null`,
 * `undefined`, "" or the dash a `lib/` function returned from
 * `absentText()`. For a cell whose words are built somewhere else.
 */
export function AbsentOr({
    children,
    says,
    className,
}: {
    children: React.ReactNode;
    says?: string;
    /** For the dash only. */
    className?: string;
}) {
    if (isAbsentText(children) || children === false) {
        return <AbsentValue says={says} className={className} />;
    }
    return <>{children}</>;
}
