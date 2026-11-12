import { Usage } from "@/components/settings/developers/usage";
import { readApiUsage } from "@/lib/api-keys/service";
import { upgradeHref } from "@/lib/billing/access";
import {
    activeBusinessZone,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

/**
 * Settings › API and AI apps › Usage (R14): this business's own caps and
 * this minute's calls. Everyone reads it; a Member sees the AI row only.
 */
export const metadata = { title: "Usage · API and AI apps · Settings" };

export default async function UsagePage() {
    await requireSession();
    const [usage, org, billing, zone] = await Promise.all([
        readApiUsage(),
        resolveActiveOrganization(),
        billingAccessOrNull(),
        activeBusinessZone(),
    ]);
    if (!usage) return null;
    const full = usage.minute.find((m) => m.cap > 0 && m.used >= m.cap);
    const row = full
        ? billing?.modules.find((m) => m.moduleId === `api-${full.scope}`)
        : undefined;
    const mayPlan = org?.actions?.includes("billing:manage") ?? false;
    return (
        <Usage
            usage={usage}
            plan={billing?.plan?.name ?? null}
            upgrade={
                mayPlan && row?.upgradeTo
                    ? {
                          plan: row.upgradeTo.name,
                          href: upgradeHref(row.upgradeTo.planId),
                      }
                    : null
            }
            zone={zone}
        />
    );
}
