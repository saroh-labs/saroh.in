import { EmptyState } from "@saroh/ui/empty-state";

import type { ModuleView } from "@/lib/modules/schema";

import { ModuleCard } from "./module-card";

/**
 * Settings → Modules catalog. Groups modules by operational state so a manager
 * sees, in order: what needs attention, what's mid-setup, what's running,
 * what's available to turn on, and what's archived. Each group is omitted when
 * empty. Disabled modules stay discoverable here (never presented as broken
 * routes elsewhere).
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

    const enabled = modules.filter((m) => m.lifecycle === "ENABLED");
    const groups: { title: string; hint: string; items: ModuleView[] }[] = [
        {
            title: "Needs attention",
            hint: "A dependency is unhealthy.",
            items: enabled.filter((m) => m.readiness === "ATTENTION_REQUIRED"),
        },
        {
            title: "Finish setup",
            hint: "Enabled, but a step remains before they're ready.",
            items: enabled.filter((m) => m.readiness === "SETUP_REQUIRED"),
        },
        {
            title: "Active",
            hint: "Enabled and ready to use.",
            items: enabled.filter((m) => m.readiness === "ACTIVE"),
        },
        {
            title: "Available",
            hint: "Turn these on when your business needs them.",
            items: modules.filter((m) => m.lifecycle === "DISABLED"),
        },
        {
            title: "Archived",
            hint: "Retired modules. History is preserved.",
            items: modules.filter((m) => m.lifecycle === "ARCHIVED"),
        },
    ];

    return (
        <div className="space-y-8">
            {groups
                .filter((group) => group.items.length > 0)
                .map((group) => (
                    <section key={group.title}>
                        <div className="mb-3">
                            <h2 className="text-sm font-semibold">
                                {group.title}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                {group.hint}
                            </p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {group.items.map((module) => (
                                <ModuleCard key={module.key} module={module} />
                            ))}
                        </div>
                    </section>
                ))}
        </div>
    );
}
