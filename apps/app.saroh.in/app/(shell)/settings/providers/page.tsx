import { EmptyState } from "@saroh/ui/empty-state";
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
    const health = await listProviderHealth();

    return (
        <main className="mx-auto max-w-3xl p-8">
            <PageHeader
                title="Providers & health"
                description="The external services your modules depend on, and whether each is ready."
            />
            {health.length === 0 ? (
                <EmptyState
                    title="Nothing to show"
                    description="Provider health is available to owners and admins."
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {health.map((h) => (
                        <ProviderHealthCard key={h.key} health={h} />
                    ))}
                </div>
            )}
        </main>
    );
}
