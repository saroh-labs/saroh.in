"use client";

import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";
import { Plug } from "lucide-react";

import { LimitNoticeBlock } from "@/components/billing/limit-notice";
import { EmailPromptBlock } from "@/components/communications/email-prompt";
import { AccountUpdatesBlock } from "@/components/providers/account-updates/account-updates-row";
import { ProviderList } from "@/components/providers/connections/provider-list";
import { CustomerEmailsBlock } from "@/components/providers/customer-emails/customer-emails-row";
import { GoogleCalendarRow } from "@/components/providers/google-calendar/google-calendar-row";
import { SettingsLoading } from "@/components/settings/page/settings-loading";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { useProvidersScreen } from "@/lib/providers/use-providers";

import { Drawn } from "./drawn";

export const INTEGRATIONS_SAYS =
    "Payments, email, domains and your calendar: the services your business runs on.";

/** Integrations' loader: `loading.tsx` draws the same pieces. */
function IntegrationsLoading() {
    return (
        <SettingsLoading
            title="Integrations"
            description={INTEGRATIONS_SAYS}
            rows={4}
        />
    );
}

/**
 * Settings › Integrations on React Query (DEC-259): one row per payment,
 * email and WhatsApp provider, the domains, the person's Google Calendar
 * and the customer emails. A connect or disconnect reads this tab and the
 * shell again (`useSettingsSave`); Google's connect still goes to Google.
 */
export function ProvidersContainer() {
    return (
        <Drawn
            query={useProvidersScreen()}
            section="providers"
            loading={<IntegrationsLoading />}
        >
            {(p) => (
                <SettingsPanel
                    header={
                        <SettingsPanelHeader
                            title="Integrations"
                            description={INTEGRATIONS_SAYS}
                        />
                    }
                >
                    {/* No email of its own: its customers get no emails (DEC-011). */}
                    {p.prompt ? <EmailPromptBlock prompt={p.prompt} /> : null}
                    {p.limitNotice ? (
                        <LimitNoticeBlock
                            full={p.limitNotice.full}
                            soft={p.limitNotice.soft}
                            title={p.limitNotice.title}
                            pct={p.limitNotice.pct}
                            body={p.limitNotice.body}
                            cta={p.limitNotice.cta}
                            prompt={
                                p.limitNotice.full ? "at_limit" : "near_limit"
                            }
                            href={p.limitNotice.href}
                        />
                    ) : null}
                    {/* A plan without online payments: said before Connect. */}
                    {p.paymentsLock ? (
                        <LimitNoticeBlock
                            full={false}
                            title={p.paymentsLock.title}
                            body={p.paymentsLock.body}
                            cta={p.paymentsLock.cta}
                            href={p.paymentsLock.href}
                            prompt="online_payments"
                        />
                    ) : null}
                    {/* A denial and an empty list are different facts (#177, §30). */}
                    {p.denied ? (
                        p.calendarRow ? null : (
                            <PermissionDeniedState
                                {...whoCanChange({ thing: "Integrations" })}
                            />
                        )
                    ) : !p.view?.any ? (
                        <EmptyState
                            icon={<Plug />}
                            title="No providers connected yet"
                            description="Payments, messaging and domains show here once a module that needs them is set up."
                        />
                    ) : (
                        <ProviderList
                            view={p.view}
                            payments={p.payments}
                            messaging={p.messaging}
                            webhooks={p.webhooks}
                        />
                    )}
                    {p.calendarRow ? (
                        <GoogleCalendarRow row={p.calendarRow} />
                    ) : null}
                    {p.accountUpdates?.offered ? (
                        <AccountUpdatesBlock state={p.accountUpdates} />
                    ) : null}
                    {p.customerEmails ? (
                        <CustomerEmailsBlock state={p.customerEmails} />
                    ) : null}
                </SettingsPanel>
            )}
        </Drawn>
    );
}
