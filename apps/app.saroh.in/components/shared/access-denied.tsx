import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageContainer } from "@/components/shared/page-container";

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
 * forever. What helps is knowing who can change it — which the workspace
 * design sets apart in its own block rather than trailing it on the end of the
 * explanation, because it is the only line here anyone can act on.
 */
export function AccessDenied({
    title = "You do not have access to this",
    description = "This section is limited to certain roles in this organization. An owner or admin can change what you can reach.",
    note = "The rail does not offer this row to your role, so you have reached it by address. An owner or admin of this business can change that.",
    backHref = "/",
    backLabel = "Back to Home",
}: {
    title?: ReactNode;
    description?: ReactNode;
    /** Who can change it. Pass `null` where that is not knowable. */
    note?: ReactNode;
    backHref?: string;
    backLabel?: string;
}) {
    return (
        <PageContainer>
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
        </PageContainer>
    );
}
