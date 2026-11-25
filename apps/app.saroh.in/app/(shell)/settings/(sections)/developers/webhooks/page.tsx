import { notFound } from "next/navigation";

import { WebhooksContainer } from "@/components/settings/developers/containers";
import { DevelopersLocked } from "@/components/settings/developers/locked";
import { readApiUsage } from "@/lib/api-keys/service";
import { upgradeHref } from "@/lib/billing/access";
import { DOCS_URL } from "@/lib/help/links";
import {
    activeBusinessZone,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { freeNoteShown } from "@/lib/saroh-billing/global-free";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import { eventsFor } from "@/lib/webhooks/events";

/**
 * Settings › API and AI apps › Notifications to your systems (webhooks):
 * `webhook:manage` (Owners, and whoever they give it). Where the bell's
 * "an address was turned off" notice lands (`notifications/href.ts`).
 *
 * On React Query (DEC-259): the switch, permission and plan are the gate;
 * the addresses load in the browser (`/api/settings/developers/webhooks`).
 */
export const metadata = {
    title: "Notifications to your systems · API and AI apps · Settings",
};

export default async function WebhooksPage() {
    if (!apiAreaOn()) notFound();
    await requireSession();
    const [org, usage] = await Promise.all([
        resolveActiveOrganization(),
        readApiUsage(),
    ]);
    if (!usage?.webhooks) notFound();
    if (!usage.webhooks.open) {
        const billing = await billingAccessOrNull();
        const row = billing?.modules.find((m) => m.moduleId === "webhooks");
        return (
            <DevelopersLocked
                name="Notifications to your systems"
                what={`Tell your own systems the moment something happens at ${org?.name ?? "your business"}.`}
                plan={row?.upgradeTo?.name}
                href={upgradeHref(row?.upgradeTo?.planId)}
                beforePaidPlans={freeNoteShown()}
                docsHref={`${DOCS_URL}/api/webhooks`}
            />
        );
    }
    const actions = org?.actions ?? [];
    return (
        <WebhooksContainer
            events={eventsFor((a) => actions.includes(a))}
            cap={usage.webhooks.cap}
            docs={DOCS_URL}
            zone={await activeBusinessZone()}
        />
    );
}
