import { Button } from "@saroh/ui/button";
import { CapabilityOffState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PlanLocked } from "@/components/billing/plan-locked";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageContainer } from "@/components/shared/page-container";
import { moduleAccess } from "@/lib/modules/guard";
import type { ModuleView } from "@/lib/modules/schema";

/**
 * Renders a section only when its capability is available (#117, §21).
 *
 * Applied at a section's `layout.tsx` so every nested route — including a deep
 * link straight to a detail page — is covered by one check rather than each
 * page remembering to make it.
 */

/**
 * Where a manager turns the module back on, when somewhere closer to the
 * work than Settings › Modules flips the same switch: "Also sell" on
 * Bookings › Services, for Courses and Class packs (E12).
 */
export interface SwitchedOnAt {
    href: string;
    label: string;
}

function Unavailable({
    capability,
    switchedOnAt,
}: {
    capability: ModuleView;
    switchedOnAt?: SwitchedOnAt;
}) {
    const archived = capability.lifecycle === "ARCHIVED";
    return (
        // The page keeps its skeleton. A gate that replaces the whole screen
        // leaves the person with a card and no title, unsure whether they even
        // arrived where they meant to — the workspace design draws every state
        // INSIDE the page, under its own heading.
        <PageContainer>
            <PageHeader
                holdsData={false}
                title={capability.label}
                className="mb-6"
            />
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
                            <Link
                                href={switchedOnAt?.href ?? "/settings/modules"}
                            >
                                {switchedOnAt?.label ?? "Manage capabilities"}
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
        </PageContainer>
    );
}

export async function ModuleGate({
    moduleKey,
    switchedOnAt,
    denied,
    children,
}: {
    moduleKey: string;
    switchedOnAt?: SwitchedOnAt;
    /**
     * What a role the module is out of reach for sees instead of the generic
     * denial, which is passed in (`standard`) — for a section whose screens
     * have a locked card of their own (Orders, DEC-056). Called only on a
     * denial, so it may read what it needs then.
     */
    denied?: (standard: ReactNode) => ReactNode | Promise<ReactNode>;
    children: ReactNode;
}) {
    const access = await moduleAccess(moduleKey);
    /*
     * Saroh hasn't rolled it out here (DEC-057): the business is never shown
     * it, so a bookmark or an old link finds no page — not "turned off" with
     * a button to a switch Settings doesn't have.
     */
    if (access.state === "hidden") notFound();
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
            const standard = (
                <AccessDenied
                    title={`You do not have access to ${access.module.label}`}
                    description={`Your role in this organization doesn't include ${access.module.label}. An owner or admin can change what you can reach.`}
                />
            );
            return denied ? await denied(standard) : standard;
        }
        /*
         * Shut only by the plan (U14): locked, not off. It says which plan
         * has it and the way there, rather than "turned off" with a switch
         * that wouldn't open it.
         */
        const planOnly =
            access.module.blockers.length > 0 &&
            access.module.blockers.every(
                (b) => b.code === "ENTITLEMENT_REQUIRED",
            );
        if (planOnly) {
            return (
                <PageContainer>
                    <PageHeader
                        holdsData={false}
                        title={access.module.label}
                        className="mb-6"
                    />
                    <PlanLocked
                        moduleKey={access.module.key}
                        label={access.module.label}
                        canManage={access.module.canManage}
                    />
                </PageContainer>
            );
        }
        return (
            <Unavailable
                capability={access.module}
                switchedOnAt={switchedOnAt}
            />
        );
    }
    // `available` and `unknown` both render. See moduleAccess: claiming a
    // capability is off because we could not look it up would be worse than
    // showing a section the server will refuse anyway once enforcement is on.
    return <>{children}</>;
}
