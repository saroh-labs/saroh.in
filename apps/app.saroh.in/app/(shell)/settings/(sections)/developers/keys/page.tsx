import { notFound } from "next/navigation";

import { Keys } from "@/components/settings/developers/keys";
import { DevelopersLocked } from "@/components/settings/developers/locked";
import { listApiKeys, readApiUsage } from "@/lib/api-keys/service";
import { upgradeHref } from "@/lib/billing/access";
import { DOCS_URL } from "@/lib/help/links";
import {
    activeBusinessZone,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { freeNoteShown } from "@/lib/saroh-billing/global-free";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

/**
 * Settings › API and AI apps › Connections (API keys): the Owner's
 * (`apikey:manage`). Off by its switches, the address is not found; off
 * by the plan, the tab stays and says which plan has it (on an edition
 * before its paid plans, "Coming with paid plans").
 */
export const metadata = { title: "Connections · API and AI apps · Settings" };

export default async function KeysPage() {
    const session = await requireSession();
    const [org, usage] = await Promise.all([
        resolveActiveOrganization(),
        readApiUsage(),
    ]);
    if (!usage?.keys || usage.keys.kinds.length === 0) notFound();
    const business = org?.name ?? "your business";
    if (usage.keys.open.length === 0) {
        const billing = await billingAccessOrNull();
        const row = billing?.modules.find((m) => m.moduleId === "api-secret");
        return (
            <DevelopersLocked
                name="Connections"
                what={`Connect your own website or software to ${business}.`}
                plan={row?.upgradeTo?.name}
                href={upgradeHref(row?.upgradeTo?.planId)}
                beforePaidPlans={freeNoteShown()}
                docsHref={`${DOCS_URL}/api/keys`}
            />
        );
    }
    const [keys, zone] = await Promise.all([
        listApiKeys(),
        activeBusinessZone(),
    ]);
    return (
        <Keys
            keys={keys}
            selfId={session.user.id}
            business={business}
            actions={org?.actions ?? []}
            open={usage.keys.open}
            count={usage.keys.count}
            cap={usage.keys.cap}
            docs={DOCS_URL}
            zone={zone}
        />
    );
}
