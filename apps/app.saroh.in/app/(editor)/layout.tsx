import type { ReactNode } from "react";

import { ModuleGate } from "@/components/modules/module-gate";
import { SiteFacesProvider } from "@/components/sites/site-faces";
import { SITE_FACES } from "@/lib/sites/site-fonts";

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
 * the capability check behind (§21).
 */
export default function EditorLayout({ children }: { children: ReactNode }) {
    // The merchant faces, so the preview shows the site's chosen typeface.
    return (
        <ModuleGate moduleKey="WEBSITE">
            <SiteFacesProvider faces={SITE_FACES}>{children}</SiteFacesProvider>
        </ModuleGate>
    );
}
