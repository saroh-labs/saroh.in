import { ModuleGate } from "@/components/modules/gate/module-gate";
import { ShareContainer } from "@/components/settings/tabs/share-tab";
import { requireSession } from "@/lib/session";

/**
 * Settings › Share (plan U5, "Saroh QR Codes" design): what the business
 * hands customers to reach it. QR codes are its first section; another way
 * to share gets a section of its own under the same heading.
 *
 * The codes open pages of the website, so the tab sits behind Website's
 * gate: off, it says so and that nothing was deleted; out of a role's
 * reach, it says that. Anyone with `site:read` sees the codes; making and
 * changing one is `site:update`, which the API judges again on every save.
 *
 * On React Query (DEC-259): the gate is the page's; the codes load in the
 * browser from `/api/settings/share` (`ShareContainer`).
 */
export const metadata = { title: "Share · Settings" };

export default async function ShareSettingsPage() {
    await requireSession();
    return (
        <ModuleGate moduleKey="WEBSITE">
            <ShareContainer />
        </ModuleGate>
    );
}
