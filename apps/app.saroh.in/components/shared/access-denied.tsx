import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import Link from "next/link";
import type { ReactNode } from "react";

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
 * forever. What helps is knowing who can change it.
 */
export function AccessDenied({
    title = "You do not have access to this",
    description = "This section is limited to certain roles in this organization. An owner or admin can change what you can reach.",
    backHref = "/",
    backLabel = "Back to Home",
}: {
    title?: ReactNode;
    description?: ReactNode;
    backHref?: string;
    backLabel?: string;
}) {
    return (
        <main className="mx-auto w-full max-w-md p-6 sm:p-12">
            <PermissionDeniedState
                title={title}
                description={description}
                action={
                    <Button asChild variant="outline" className="wk-press">
                        <Link href={backHref}>{backLabel}</Link>
                    </Button>
                }
            />
        </main>
    );
}
