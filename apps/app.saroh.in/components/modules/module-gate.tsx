import { Button } from "@saroh/ui/button";
import { CapabilityOffState } from "@saroh/ui/data-state";
import Link from "next/link";
import type { ReactNode } from "react";

import { AccessDenied } from "@/components/shared/access-denied";
import { moduleAccess } from "@/lib/modules/guard";
import type { ModuleView } from "@/lib/modules/schema";

/**
 * Renders a section only when its capability is available (#117, §21).
 *
 * Applied at a section's `layout.tsx` so every nested route — including a deep
 * link straight to a detail page — is covered by one check rather than each
 * page remembering to make it.
 */

function Unavailable({ capability }: { capability: ModuleView }) {
    const archived = capability.lifecycle === "ARCHIVED";
    return (
        <CapabilityOffState
            title={`${capability.label} is turned off`}
            description={
                archived
                    ? `${capability.label} has been archived for this organization. Nothing it holds has been deleted — turning it back on restores this section.`
                    : `${capability.label} is not switched on for this organization. Nothing it holds has been deleted; turning it on brings this section back.`
            }
            action={
                capability.canManage ? (
                    <Button variant="brand" asChild>
                        <Link href="/settings/modules">
                            Manage capabilities
                        </Link>
                    </Button>
                ) : (
                    // Say what is true: a MEMBER cannot fix this themselves, so
                    // offering them a settings button would be a dead end.
                    <p className="text-sm text-muted-foreground">
                        An owner or admin can switch it on in Settings.
                    </p>
                )
            }
        />
    );
}

export async function ModuleGate({
    moduleKey,
    children,
}: {
    moduleKey: string;
    children: ReactNode;
}) {
    const access = await moduleAccess(moduleKey);
    if (access.state === "unavailable") {
        /*
         * Readiness is DISABLED for ANY closed gate, and authorization is one
         * of them. Rendering every DISABLED as "turned off" told a MEMBER that
         * a capability their colleagues were using had been switched off for
         * the whole organization (#274). A role that does not reach a module
         * is a denial, and says so. When the module is off AND out of reach,
         * the denial wins: the person reading this can do nothing about the
         * switch.
         */
        const unauthorized = access.module.blockers.some(
            (b) => b.code === "UNAUTHORIZED",
        );
        if (unauthorized) {
            return (
                <AccessDenied
                    title={`You do not have access to ${access.module.label}`}
                    description={`Your role in this organization doesn't include ${access.module.label}. An owner or admin can change what you can reach.`}
                />
            );
        }
        return <Unavailable capability={access.module} />;
    }
    // `available` and `unknown` both render. See moduleAccess: claiming a
    // capability is off because we could not look it up would be worse than
    // showing a section the server will refuse anyway once enforcement is on.
    return <>{children}</>;
}
