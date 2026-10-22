import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";

import { OnlinePaymentsLockNotice } from "@/components/billing/online-payments-lock";
import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { EmailPromptBlock } from "@/components/communications/email-prompt";
import { AccountUpdatesBlock } from "@/components/providers/account-updates/account-updates-row";
import { ProviderList } from "@/components/providers/connections/provider-list";
import { CustomerEmailsBlock } from "@/components/providers/customer-emails/customer-emails-row";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { readAccountUpdates } from "@/lib/communications/account-updates-service";
import { readCustomerEmails } from "@/lib/communications/customer-emails-service";
import { emailPrompt } from "@/lib/communications/email-setup";
import { readEmailSetup } from "@/lib/communications/email-setup-service";
import { listOrgDomains } from "@/lib/domains/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { listProviderHealth } from "@/lib/provider-health/service";
import { connectLocksOf } from "@/lib/providers/connect-lock";
import { buildProvidersView, CONNECT_EMAIL_ANCHOR } from "@/lib/providers/rows";
import {
    listCommsProviders,
    listPaymentProviders,
    listPaymentWebhooks,
} from "@/lib/providers/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { listCheckoutProviders } from "@/lib/stores/storefronts";
import { Plug } from "lucide-react";

/**
 * Settings → Providers (#123). One OWNER/ADMIN surface for the services
 * behind the Organization — a row per payment, email and WhatsApp
 * provider, connected ones first, then the business's domains — whether
 * each is connected, what it is called at the provider's end, and the way to
 * connect, manage or disconnect it. No credentials are ever shown; the API is
 * OWNER/ADMIN-only.
 */
export const metadata = { title: "Providers · Settings" };

export default async function ProvidersSettingsPage() {
    await requireSession();
    // The business's automatic emails to its customers (DEC-174, U4),
    // read beside everything else. Anyone in the business may read them;
    // never throws, and null draws no row.
    const customerEmailsRead = readCustomerEmails();
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
        access,
        emailSetup,
        accountUpdates,
    ] =
        result.status === "denied"
            ? [null, null, null, [], null, null, null, null]
            : await Promise.all([
                  listPaymentProviders(),
                  listCommsProviders(),
                  listOrgDomains(),
                  listCheckoutProviders(),
                  // The address to register and the last payment update
                  // (DEC-063). Best-effort: it never fails the page.
                  listPaymentWebhooks(),
                  // What the plan lets the business connect (DEC-091):
                  // locked payment rows offer See plans in place of
                  // Connect, before any key form opens. Best-effort.
                  billingAccessOrNull(),
                  // Whether customers get emails at all (DEC-011), and
                  // whether the plan lets it connect its own: the prompt
                  // and the email rows' lock read it. Null when unread.
                  readEmailSetup(emailMay),
                  // Whether Saroh posts updates to customers' Messages,
                  // and whether that choice can have an effect yet. Null
                  // when unread or not this person's: no row is drawn.
                  readAccountUpdates(),
              ]);
    const customerEmails =
        result.status === "denied" ? null : await customerEmailsRead;
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
                  locks: connectLocksOf(access, emailSetup),
              });
    // Connect jumps to the first email provider to connect on this page.
    const prompt = emailPrompt(
        emailSetup,
        emailMay,
        view?.connectEmailKey ? `#${CONNECT_EMAIL_ANCHOR}` : null,
    );

    return (
        <SettingsPanel
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
                payment links, no checkout — said here, before Connect. */}
            <OnlinePaymentsLockNotice what="payments" />
            {/* Three outcomes, three states. "Nothing to show" was previously
                rendered for both a denial and an empty list, which are
                different facts about the same screen (#177, §30). */}
            {result.status === "denied" ? (
                <PermissionDeniedState
                    {...whoCanChange({ thing: "Providers" })}
                />
            ) : !view?.any ? (
                <EmptyState
                    icon={<Plug />}
                    title="No providers connected yet"
                    description="Payments, messaging and domains show here once a module that needs them is set up."
                />
            ) : (
                <ProviderList
                    view={view}
                    payments={payments ?? []}
                    messaging={messaging ?? []}
                    webhooks={webhooks}
                />
            )}
            {/* The business's own choice about Saroh's posts in its
                customers' Messages: drawn only while it can have an effect. */}
            {accountUpdates?.offered ? (
                <AccountUpdatesBlock state={accountUpdates} />
            ) : null}
            {/* The automatic emails Saroh sends its customers from its own
                email, one switch each: drawn only while one is offered. */}
            {customerEmails ? (
                <CustomerEmailsBlock state={customerEmails} />
            ) : null}
        </SettingsPanel>
    );
}
