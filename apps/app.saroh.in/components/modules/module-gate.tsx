import { ModuleOffState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PlanLocked } from "@/components/billing/plan-locked";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageContainer } from "@/components/shared/page-container";
import { whoCanChange } from "@/components/shared/who-can-change";
import { moduleAccess } from "@/lib/modules/guard";
import { moduleName } from "@/lib/modules/names";
import type { ModuleView } from "@/lib/modules/schema";
import { knownRoleName } from "@/lib/organizations/role-name";
import { resolveActiveOrganization } from "@/lib/organizations/service";

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
    // The menu's name for it (Sell, Contacts), never the registry's.
    const name = moduleName(capability.key, [capability]);
    return (
        // The page keeps its skeleton. A gate that replaces the whole screen
        // leaves the person with a card and no title, unsure whether they even
        // arrived where they meant to — the workspace design draws every state
        // INSIDE the page, under its own heading.
        <PageContainer>
            <PageHeader breadcrumb={[name]} title={name} className="mb-6" />
            {/* Someone who can't turn it on reads who can: a button to a
                switch they can't press would be a dead end. */}
            <ModuleOffState
                name={name}
                canTurnOn={capability.canManage}
                href={switchedOnAt?.href}
                actionLabel={switchedOnAt?.label}
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
         * the whole business (#274). A role that does not reach a module
         * is a denial, and says so. When the module is off AND out of reach,
         * the denial wins: the person reading this can do nothing about the
         * switch.
         */
        const unauthorized = access.module.blockers.some(
            (b) => b.code === "UNAUTHORIZED",
        );
        if (unauthorized) {
            const organization = await resolveActiveOrganization();
            const standard = (
                <AccessDenied
                    {...whoCanChange({
                        thing: moduleName(access.module.key, [access.module]),
                        business: organization?.name,
                        role: organization ? knownRoleName(organization) : null,
                    })}
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
                        breadcrumb={[access.module.label]}
                        title={access.module.label}
                        className="mb-6"
                    />
                    <PlanLocked
                        moduleKey={access.module.key}
                        label={access.module.label}
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
