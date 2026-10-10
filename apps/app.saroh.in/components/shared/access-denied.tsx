import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageContainer } from "@/components/shared/page-container";
import { whoCanChange } from "@/components/shared/who-can-change";

/**
 * The one way this app says "your role does not reach this" (#177, §30).
 *
 * Three paths arrive here:
 * - a segment `forbidden.tsx`, because a server read got a 403 and `getJson`
 *   called `forbidden()`;
 * - `ModuleGate`, when the actor lacks a module's `requiredAction`;
 * - `SectionError`, for a denial whose status survived the throw.
 *
 * They used to word it separately, and ModuleGate did not word it at all: it
 * told a MEMBER that Website was switched off (#274).
 *
 * There is no retry. Nothing failed, and trying again does the same thing
 * forever. What helps is knowing who can change it, which the workspace
 * design sets apart in its own block rather than trailing it on the end of the
 * explanation, because it is the only line here anyone can act on.
 *
 * The words are `whoCanChange()`'s (`who-can-change.ts`): pass its three
 * lines for a named thing, or nothing for a denial that only knows it was
 * one. Never a wording of a screen's own.
 */
const STANDARD = whoCanChange();

export function AccessDenied({
    title = STANDARD.title,
    description = STANDARD.description,
    note = STANDARD.note,
    backHref = "/",
    backLabel = "Back to Home",
    bare = false,
}: {
    title?: ReactNode;
    description?: ReactNode;
    /** Who can change it. Pass `null` where that is not knowable. */
    note?: ReactNode;
    backHref?: string;
    backLabel?: string;
    /** The card alone, for a page that draws its own frame around it. */
    bare?: boolean;
}) {
    const card = (
        <PermissionDeniedState
            title={title}
            description={description}
            note={note}
            action={
                <Button asChild variant="outline" className="wk-press">
                    <Link href={backHref}>{backLabel}</Link>
                </Button>
            }
        />
    );
    return bare ? card : <PageContainer>{card}</PageContainer>;
}
