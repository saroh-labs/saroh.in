import type { Metadata } from "next";
import type { ReactNode } from "react";

import { EditorAskAiProvider } from "@/components/ask-ai/editor-ask-ai";
import { PlanAccessProvider } from "@/components/billing/plan-way";
import { ModuleGate } from "@/components/modules/gate/module-gate";
import { SiteFacesProvider } from "@/components/sites/looks/site-faces";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { getAskAiState } from "@/lib/ask-ai/service";
import { mayChangePlan } from "@/lib/billing/plan-access";
import { businessZone } from "@/lib/format/business-zone";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { activeBusinessTitle } from "@/lib/organizations/tab-title";
import { SITE_FACES } from "@/lib/sites/site-fonts";

/** The editor's tab names the business too, as the shell's does. */
export function generateMetadata(): Promise<Metadata> {
    return activeBusinessTitle();
}

/**
 * Full-screen editing surfaces.
 *
 * The site editor is a workspace, not a page inside one: the design gives it the
 * whole viewport and a "← Sites" link as the way back, because a three-pane
 * editor competing with the workspace rail leaves the preview narrower than the
 * phone it is meant to simulate.
 *
 * So this group deliberately does NOT render `AppShell` — the same escape the
 * `(shell)` group's own note describes for routes that want quieter chrome. It
 * still gates on the capability, because leaving the shell must not mean leaving
 * the capability check behind (§21). Nor the plan's: it mounts the shell's
 * `PlanAccessProvider` too.
 */
export default async function EditorLayout({
    children,
}: {
    children: ReactNode;
}) {
    // Whether this person may change the plan (`billing:manage`), said once
    // as the shell says it, so a plan prompt in the editor offers the way
    // to another plan only to someone who may and says who can to anyone
    // else (`PlanWay`). A business that couldn't be read says nothing, and
    // the page a link opens decides.
    const organization = await activeOrganizationOnce().catch(() => undefined);
    // Ask AI, as the shell mounts it (`app-shell.tsx`): the editors' Ask AI
    // buttons open it by event, and without a host here nothing opened.
    const askAiShown =
        askAiOn() && !!organization && organization.role !== "REVIEWER";
    const askAiState = askAiShown
        ? await getAskAiState().catch(() => null)
        : null;
    // The merchant faces, so the preview shows the site's chosen typeface.
    const faces = (
        <SiteFacesProvider faces={SITE_FACES}>{children}</SiteFacesProvider>
    );
    // Ask AI, docked in the editors' right column at the desk and the
    // shared sheet on a phone (owner, 21 Nov); never for a Reviewer.
    const editor = (
        <ModuleGate moduleKey="WEBSITE">
            {organization && askAiShown ? (
                <EditorAskAiProvider
                    state={askAiState}
                    businessName={organization.name}
                    zone={businessZone(organization)}
                >
                    {faces}
                </EditorAskAiProvider>
            ) : (
                faces
            )}
        </ModuleGate>
    );
    if (organization === undefined) return editor;
    return (
        <PlanAccessProvider canChangePlan={mayChangePlan(organization)}>
            {editor}
        </PlanAccessProvider>
    );
}
