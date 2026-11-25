import { SettingsTabScreen } from "@/components/settings/settings-tab-screen";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Providers (#123). One OWNER/ADMIN surface for the services
 * behind the Organization — a row per payment, email and WhatsApp
 * provider, connected ones first, then the business's domains — whether
 * each is connected, what it is called at the provider's end, and the way to
 * connect, manage or disconnect it. No credentials are ever shown; the API is
 * OWNER/ADMIN-only.
 *
 * And the person's own Google Calendar (20 Nov 2026), its own group, for
 * anyone it is switched on for: someone who may not manage the business's
 * providers sees only that, not a refusal.
 *
 * On React Query (DEC-259): the read (`/api/providers`,
 * `lib/providers/access.ts`) loads in the browser, drawn by
 * `SettingsTabScreen`; each connection crosses as its row's facts.
 */
export const metadata = { title: "Integrations · Settings" };

export default async function ProvidersSettingsPage() {
    await requireSession();
    const org = await activeOrganizationOnce();
    return (
        <SettingsTabScreen
            tab="/settings/integrations"
            kind={org?.kind ?? null}
        />
    );
}
