import "server-only";

import {
    accessRow,
    onlinePaymentsLock,
    rowNotice,
    upgradeHref,
} from "@/lib/billing/access";
import { readAccountUpdates } from "@/lib/communications/account-updates-service";
import { readCustomerEmails } from "@/lib/communications/customer-emails-service";
import { emailPrompt } from "@/lib/communications/email-setup";
import { readEmailSetup } from "@/lib/communications/email-setup-service";
import { listOrgDomains } from "@/lib/domains/service";
import { readGoogleCalendar } from "@/lib/google-calendar/service";
import { calendarProviderRow } from "@/lib/google-calendar/words";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { listProviderHealth } from "@/lib/provider-health/service";
import { connectLocksOf } from "@/lib/providers/connect-lock";
import { buildProvidersView, CONNECT_EMAIL_ANCHOR } from "@/lib/providers/rows";
import type {
    ConnectedCommsProvider,
    ConnectedPaymentProvider,
    PaymentWebhookSetup,
} from "@/lib/providers/service";
import {
    listCommsProviders,
    listPaymentProviders,
    listPaymentWebhooks,
} from "@/lib/providers/service";
import type { ServerRead } from "@/lib/query/route";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { emailAttention, providersTabNote } from "@/lib/settings/ready";
import { listCheckoutProviders } from "@/lib/stores/storefronts";

import type { ProvidersScreen } from "./queries";
import { providersRead } from "./queries";

/**
 * Integrations: anyone in the business. Who may see the business's
 * providers is the API's answer (`provider-health` 403 draws only the
 * person's own Google Calendar), as the page decided it.
 */
export async function mayReadProviders(): Promise<boolean> {
    return !!(await activeOrganizationOnce());
}

/** A payment connection as its row and sheet draw it: never a key secret or webhook secret. */
export function paymentFacts(
    p: ConnectedPaymentProvider,
): ConnectedPaymentProvider {
    return {
        id: p.id,
        provider: p.provider,
        status: p.status,
        // The publishable key: shown on the row, never a secret.
        publicKey: p.publicKey,
        webhookSecretMissing: p.webhookSecretMissing,
        attention: p.attention
            ? { reason: p.attention.reason, since: p.attention.since }
            : p.attention,
        activeMemberships: p.activeMemberships,
        checkoutStyle: p.checkoutStyle,
        updatedAt: p.updatedAt,
    };
}

/** An email or WhatsApp connection: never its credentials. */
export function commsFacts(c: ConnectedCommsProvider): ConnectedCommsProvider {
    return {
        id: c.id,
        channel: c.channel,
        provider: c.provider,
        status: c.status,
        fromAddress: c.fromAddress,
        attention: c.attention
            ? { reason: c.attention.reason, since: c.attention.since }
            : c.attention,
        updatedAt: c.updatedAt,
    };
}

function webhookFacts(w: PaymentWebhookSetup): PaymentWebhookSetup {
    return {
        provider: w.provider,
        url: w.url,
        events: w.events,
        secretRequired: w.secretRequired,
        lastReceivedAt: w.lastReceivedAt,
    };
}

export const providersServer: ServerRead<
    Parameters<typeof providersRead.options>[1],
    ProvidersScreen
> = {
    read: providersRead,
    service: async () => {
        // Anyone may read the customer emails; never throws, null draws no row.
        const customerEmailsRead = readCustomerEmails();
        const [result, org, calendar] = await Promise.all([
            listProviderHealth(),
            activeOrganizationOnce(),
            readGoogleCalendar(),
        ]);
        const calendarRow = calendarProviderRow(calendar);
        const may = (action: string) =>
            org?.actions
                ? org.actions.includes(action)
                : org?.role === "OWNER" || org?.role === "ADMIN";
        const emailMay = {
            connect: may("comms:manage"),
            plans: may("billing:read"),
        };
        if (result.status === "denied") {
            return {
                denied: true,
                view: null,
                payments: [],
                messaging: [],
                webhooks: null,
                prompt: null,
                limitNotice: null,
                paymentsLock: null,
                calendarRow,
                accountUpdates: null,
                customerEmails: null,
                tabNote: null,
            };
        }
        // Read only once the health read let this person manage providers.
        const [
            payments,
            messaging,
            domains,
            checkout,
            webhooks,
            access,
            emailSetup,
            accountUpdates,
            modules,
        ] = await Promise.all([
            listPaymentProviders(),
            listCommsProviders(),
            listOrgDomains(),
            listCheckoutProviders(),
            // The address to register and the last update (DEC-063); best-effort.
            listPaymentWebhooks(),
            // What the plan lets it connect (DEC-091); best-effort.
            billingAccessOrNull(),
            readEmailSetup(emailMay),
            readAccountUpdates(),
            // For the side list's email line, as the layout reads it.
            emailMay.connect ? modulesOrUnknown() : Promise.resolve(null),
        ]);
        const view = buildProvidersView({
            health: result.health,
            payments,
            messaging,
            domains,
            checkout,
            webhooks,
            locks: connectLocksOf(access, emailSetup),
        });
        const notice = rowNotice(access, "integrations");
        return {
            denied: false,
            view,
            payments: (payments ?? []).map(paymentFacts),
            messaging: (messaging ?? []).map(commsFacts),
            webhooks: webhooks ? webhooks.map(webhookFacts) : null,
            // Connect jumps to the first email provider to connect here.
            prompt: emailPrompt(
                emailSetup,
                emailMay,
                view.connectEmailKey ? `#${CONNECT_EMAIL_ANCHOR}` : null,
            ),
            limitNotice: notice.on
                ? {
                      ...notice,
                      href:
                          notice.href ??
                          upgradeHref(
                              accessRow(access, "integrations")?.upgradeTo
                                  ?.planId,
                          ),
                  }
                : null,
            paymentsLock: onlinePaymentsLock(access, "payments"),
            calendarRow,
            accountUpdates,
            customerEmails: await customerEmailsRead,
            tabNote: emailMay.connect
                ? providersTabNote(emailAttention(modules, messaging), {
                      setup: emailSetup,
                      mayPlans: emailMay.plans,
                  })
                : null,
        };
    },
};
