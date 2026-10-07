import type { ReactNode } from "react";

import { ModuleGate } from "@/components/modules/module-gate";
import { SiteFacesProvider } from "@/components/sites/site-faces";
import { SITE_FACES } from "@/lib/sites/site-fonts";

/**
 * Capability gate for this section (#117, §21).
 *
 * The sidebar already hides WEBSITE when it is off, but hiding a nav item is
 * not enforcement — a bookmark or a pasted link reaches these routes directly.
 * Gating at the layout covers every nested route, including deep links to a
 * detail page, with one check.
 */
export default function Layout({ children }: { children: ReactNode }) {
    // The merchant faces, so a site's previews show its chosen typeface.
    return (
        <ModuleGate moduleKey="WEBSITE">
            <SiteFacesProvider faces={SITE_FACES}>{children}</SiteFacesProvider>
        </ModuleGate>
    );
}
