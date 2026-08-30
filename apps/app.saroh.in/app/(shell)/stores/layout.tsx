import type { ReactNode } from "react";

import { ModuleGate } from "@/components/modules/module-gate";

/**
 * Capability gate for this section (#117, §21).
 *
 * The sidebar already hides COMMERCE when it is off, but hiding a nav item is
 * not enforcement — a bookmark or a pasted link reaches these routes directly.
 * Gating at the layout covers every nested route, including deep links to a
 * detail page, with one check.
 */
export default function Layout({ children }: { children: ReactNode }) {
    return <ModuleGate moduleKey="COMMERCE">{children}</ModuleGate>;
}
