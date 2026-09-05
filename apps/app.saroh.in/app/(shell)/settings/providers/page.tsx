import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";

import { ProviderHealthCard } from "@/components/providers/provider-health-card";
import { listProviderHealth } from "@/lib/provider-health/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Providers (#123). One OWNER/ADMIN surface for the health of the
 * Organization's external dependencies — payments, communications, domains —
 * separating who owns each and what breaks when it's unhealthy. No credentials
 * are ever shown; the API is OWNER/ADMIN-only.
 */
export const metadata = { title: "Providers" };

export default async function ProvidersSettingsPage() {
    await requireSession();
    const result = await listProviderHealth();

    return (
        <main className="mx-auto max-w-3xl p-8">
            <PageHeader
                title="Providers & health"
                description="The external services your modules depend on, and whether each is ready."
            />
            {/* Three outcomes, three states. "Nothing to show" was previously
                rendered for both a denial and an empty list, which are
                different facts about the same screen (#177, §30). */}
            {result.status === "denied" ? (
                <PermissionDeniedState
                    title="Provider health is limited to owners and admins"
                    description="It can name the credentials an organization depends on, so it is kept to the roles that manage them. An owner or admin can tell you whether anything needs attention."
                />
            ) : result.health.length === 0 ? (
                <EmptyState
                    title="No providers connected yet"
                    description="Payments, messaging and domains appear here once a module that needs them is set up."
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {result.health.map((h) => (
                        <ProviderHealthCard key={h.key} health={h} />
                    ))}
                </div>
            )}
        </main>
    );
}
