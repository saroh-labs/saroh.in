import type { ReactNode } from "react";

import { ModuleGate } from "@/components/modules/module-gate";

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
    return <ModuleGate moduleKey="WEBSITE">{children}</ModuleGate>;
}
