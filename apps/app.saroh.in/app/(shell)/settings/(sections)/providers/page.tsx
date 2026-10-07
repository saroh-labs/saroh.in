import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";

import { OnlinePaymentsLockNotice } from "@/components/billing/online-payments-lock";
import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { EmailPromptBlock } from "@/components/communications/email-prompt";
import { ProviderList } from "@/components/providers/provider-list";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { emailPrompt } from "@/lib/communications/email-setup";
import { readEmailSetup } from "@/lib/communications/email-setup-service";
import { listOrgDomains } from "@/lib/domains/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { listProviderHealth } from "@/lib/provider-health/service";
import { CONNECT_EMAIL_ANCHOR } from "@/lib/providers/booking-emails";
import { buildProvidersView } from "@/lib/providers/rows";
import {
    getSarohEmail,
    listCommsProviders,
    listPaymentProviders,
    listPaymentWebhooks,
} from "@/lib/providers/service";
import { requireSession } from "@/lib/session";
import { listCheckoutProviders } from "@/lib/stores/storefronts";

/**
 * Settings → Providers (#123). One OWNER/ADMIN surface for the services
 * behind the Organization — a row per payment, email and WhatsApp
 * provider, connected ones first, then the business's domains — whether
 * each is connected, what it is called at the provider's end, and the way to
 * connect, manage or disconnect it. No credentials are ever shown; the API is
 * OWNER/ADMIN-only.
 */
export const metadata = { title: "Providers" };

export default async function ProvidersSettingsPage() {
    await requireSession();
    const [result, org] = await Promise.all([
        listProviderHealth(),
        resolveActiveOrganization(),
    ]);
    const may = (action: string) =>
        org?.actions
            ? org.actions.includes(action)
            : org?.role === "OWNER" || org?.role === "ADMIN";
    const emailMay = {
        connect: may("comms:manage"),
        plans: may("billing:read"),
    };
    // Everything else is only read once the health read has shown this
    // person may manage providers.
    const [
        payments,
        messaging,
        domains,
        checkout,
        webhooks,
        sarohEmail,
        emailSetup,
    ] =
        result.status === "denied"
            ? [null, null, null, [], null, null, null]
            : await Promise.all([
                  listPaymentProviders(),
                  listCommsProviders(),
                  listOrgDomains(),
                  listCheckoutProviders(),
                  // The address to register and the last payment update
                  // (DEC-063). Best-effort: it never fails the page.
                  listPaymentWebhooks(),
                  // Saroh sending booking emails (DEC-086). Never throws:
                  // a failed read is UNREAD, said in its own notice.
                  getSarohEmail(),
                  // Whether customers get emails at all (DEC-011): asked
                  // only of who can act on it. Null when unread.
                  readEmailSetup(emailMay),
              ]);
    const view =
        result.status === "denied"
            ? null
            : buildProvidersView({
                  health: result.health,
                  payments,
                  messaging,
                  domains,
                  checkout,
                  webhooks,
                  sarohEmail,
              });
    // Connect jumps to the first email provider to connect on this page.
    const prompt = emailPrompt(
        emailSetup,
        emailMay,
        view?.connectEmailKey ? `#${CONNECT_EMAIL_ANCHOR}` : null,
    );

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
            {/* No email of its own: its customers get no emails (DEC-011). */}
            {prompt ? <EmailPromptBlock prompt={prompt} /> : null}
            <PlanLimitNotice moduleId="integrations" />
            {/* A plan without online payments: no first connection, no
                pay links, no checkout — said here, before Connect. */}
            <OnlinePaymentsLockNotice what="payments" />
            {/* Three outcomes, three states. "Nothing to show" was previously
                rendered for both a denial and an empty list, which are
                different facts about the same screen (#177, §30). */}
            {result.status === "denied" ? (
                <PermissionDeniedState
                    title="Provider health is limited to owners and admins"
                    description="It can name the credentials an organization depends on, so it is kept to the roles that manage them. An owner or admin can tell you whether anything needs attention."
                />
            ) : !view?.any ? (
                <EmptyState
                    title="No providers connected yet"
                    description="Payments, messaging and domains appear here once a module that needs them is set up."
                />
            ) : (
                <ProviderList
                    view={view}
                    payments={payments ?? []}
                    messaging={messaging ?? []}
                    webhooks={webhooks}
                />
            )}
        </SettingsPanel>
    );
}
