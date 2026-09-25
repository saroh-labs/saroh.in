import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";

import { ProviderList } from "@/components/providers/provider-list";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { listOrgDomains } from "@/lib/domains/service";
import { listProviderHealth } from "@/lib/provider-health/service";
import { buildProviderRows } from "@/lib/providers/rows";
import {
    listCommsProviders,
    listPaymentProviders,
} from "@/lib/providers/service";
import { requireSession } from "@/lib/session";
import { listCheckoutProviders } from "@/lib/stores/storefronts";

/**
 * Settings → Providers (#123). One OWNER/ADMIN surface for the services
 * behind the Organization — payments, email, WhatsApp, domains — whether
 * each is connected, what it is called at the provider's end, and the way to
 * connect, manage or disconnect it. No credentials are ever shown; the API is
 * OWNER/ADMIN-only.
 */
export const metadata = { title: "Providers" };

export default async function ProvidersSettingsPage() {
    await requireSession();
    const result = await listProviderHealth();
    // Everything else is only read once the health read has shown this
    // person may manage providers.
    const [payments, messaging, domains, checkout] =
        result.status === "denied"
            ? [null, null, null, []]
            : await Promise.all([
                  listPaymentProviders(),
                  listCommsProviders(),
                  listOrgDomains(),
                  listCheckoutProviders(),
              ]);
    const rows =
        result.status === "denied"
            ? []
            : buildProviderRows({
                  health: result.health,
                  payments,
                  messaging,
                  domains,
                  checkout,
              });

    return (
        <SettingsPanel
            width="default"
            header={
                <SettingsPanelHeader
                    title="Providers"
                    description="The services that keep your site, email and payments running."
                />
            }
        >
            {/* Three outcomes, three states. "Nothing to show" was previously
                rendered for both a denial and an empty list, which are
                different facts about the same screen (#177, §30). */}
            {result.status === "denied" ? (
                <PermissionDeniedState
                    title="Provider health is limited to owners and admins"
                    description="It can name the credentials an organization depends on, so it is kept to the roles that manage them. An owner or admin can tell you whether anything needs attention."
                />
            ) : rows.length === 0 ? (
                <EmptyState
                    title="No providers connected yet"
                    description="Payments, messaging and domains appear here once a module that needs them is set up."
                />
            ) : (
                <ProviderList
                    rows={rows}
                    payments={payments ?? []}
                    messaging={messaging ?? []}
                />
            )}
        </SettingsPanel>
    );
}
