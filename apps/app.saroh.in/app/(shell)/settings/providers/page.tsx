import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";

import { ProviderHealthList } from "@/components/providers/provider-health-list";
import { ProviderSetupDialog } from "@/components/providers/provider-setup-dialog";
import { PageContainer } from "@/components/shared/page-container";
import { listProviderHealth } from "@/lib/provider-health/service";
import {
    listCommsProviders,
    listPaymentProviders,
} from "@/lib/providers/service";
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
    // What is connected, for the setup dialogs. Only read once the health
    // read has shown this person may manage providers.
    const [payments, messaging] =
        result.status === "denied"
            ? [null, null]
            : await Promise.all([listPaymentProviders(), listCommsProviders()]);

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={["Workspace", "Providers"]}
                title="Providers"
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
                <ProviderHealthList
                    health={result.health}
                    actionFor={(h, action) =>
                        h.key === "PAYMENTS" ? (
                            <ProviderSetupDialog
                                kind="payments"
                                label={h.label}
                                trigger={action.label}
                                urgent={action.urgent}
                                connected={payments ?? []}
                            />
                        ) : h.key === "COMMUNICATIONS" ? (
                            <ProviderSetupDialog
                                kind="messaging"
                                label={h.label}
                                trigger={action.label}
                                urgent={action.urgent}
                                connected={messaging ?? []}
                            />
                        ) : null
                    }
                />
            )}
        </PageContainer>
    );
}
