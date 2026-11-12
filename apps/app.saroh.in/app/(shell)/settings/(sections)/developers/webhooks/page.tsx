import { notFound } from "next/navigation";

import { DevelopersLocked } from "@/components/settings/developers/locked";
import { Webhooks } from "@/components/settings/developers/webhooks";
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
import { eventsFor } from "@/lib/webhooks/events";
import { listWebhooks } from "@/lib/webhooks/service";

/**
 * Settings › API and AI apps › Notifications to your systems (webhooks):
 * `webhook:manage` (Owners, and whoever they give it). Where the bell's
 * "an address was turned off" notice lands (`notifications/href.ts`).
 */
export const metadata = {
    title: "Notifications to your systems · API and AI apps · Settings",
};

export default async function WebhooksPage() {
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
    const [endpoints, zone] = await Promise.all([
        listWebhooks(),
        activeBusinessZone(),
    ]);
    const actions = org?.actions ?? [];
    return (
        <Webhooks
            endpoints={endpoints}
            events={eventsFor((a) => actions.includes(a))}
            count={usage.webhooks.count}
            cap={usage.webhooks.cap}
            docs={DOCS_URL}
            zone={zone}
        />
    );
}
