import { EmptyState } from "@saroh/ui/empty-state";

import type { ModuleView } from "@/lib/modules/schema";

import { ModuleList } from "./module-list";

/**
 * Settings → Modules: what this business runs on.
 *
 * One list rather than five groups of cards. The groups ("Needs attention",
 * "Available", "Archived") said what a tag on the row says in less space, and
 * they put the same control in five places — the merchant's question is "what
 * is on?", and a column of switches answers it at a glance. What still needed
 * a person rises to the top of the list.
 */
export function ModuleCatalog({ modules }: { modules: ModuleView[] }) {
    if (modules.length === 0) {
        return (
            <EmptyState
                title="No modules to show"
                description="Modules appear here once your organization is set up."
            />
        );
    }

    return <ModuleList modules={modules} />;
}
