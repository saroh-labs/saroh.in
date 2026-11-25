import type { LimitNotice } from "@saroh/pricing-catalog";

import type { OnlinePaymentsLock } from "@/lib/billing/access";
import type { AccountUpdates } from "@/lib/communications/account-updates";
import type { CustomerEmails } from "@/lib/communications/customer-emails";
import type { EmailPrompt } from "@/lib/communications/email-setup";
import type { calendarProviderRow } from "@/lib/google-calendar/words";
import type { ProvidersView } from "@/lib/providers/rows";
import type {
    ConnectedCommsProvider,
    ConnectedPaymentProvider,
    PaymentWebhookSetup,
} from "@/lib/providers/service";
import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";

/**
 * Settings › Integrations (DEC-259): the business's payment, email and
 * WhatsApp connections, its domains, the person's Google Calendar and the
 * customer email switches. Client-safe: the key and the route; the service
 * is paired in `access.ts`. Never a key, a secret, a webhook signing secret
 * or a token: each connection crosses as the facts its row draws.
 */
export interface ProvidersScreen {
    /** The API refused this person the business's providers: only the calendar is theirs. */
    denied: boolean;
    view: ProvidersView | null;
    payments: ConnectedPaymentProvider[];
    messaging: ConnectedCommsProvider[];
    webhooks: PaymentWebhookSetup[] | null;
    /** No email of its own: its customers get none (DEC-011). */
    prompt: EmailPrompt | null;
    /** The plan's connections notice (80% / 100%), or null. */
    limitNotice: (LimitNotice & { on: true; href: string }) | null;
    /** A plan without online payments, said before Connect. */
    paymentsLock: OnlinePaymentsLock | null;
    calendarRow: ReturnType<typeof calendarProviderRow>;
    accountUpdates: AccountUpdates | null;
    customerEmails: CustomerEmails | null;
    /** The side list's line for Integrations while email needs a person, or null. */
    tabNote: string | null;
}

export const providersRead = defineRead<ProvidersScreen>()({
    key: (orgId) => domainKey("settings", orgId, "providers"),
    route: { path: "/api/providers", params: {} },
    tier: "settings",
});
