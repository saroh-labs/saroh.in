import { PageHeader } from "@saroh/ui/page-header";

import { ModuleCatalog } from "@/components/modules/module-catalog";
import { listModules } from "@/lib/modules/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Modules (ADR-003 / #115). Lets OWNER/ADMIN enable the capabilities
 * their business needs and see each module's effective state; other roles see
 * it read-only. Server component — fetches effective availability once from
 * api.saroh.in (which enforces the role) and hands it to the catalog.
 */
export const metadata = { title: "Modules" };

export default async function ModulesSettingsPage() {
    await requireSession();
    const modules = await listModules();

    return (
        <main className="mx-auto max-w-5xl p-8">
            <PageHeader
                title="Modules"
                description="Turn on the capabilities your business needs. Disabling a module stops new activity but never deletes your history."
            />
            <ModuleCatalog modules={modules} />
        </main>
    );
}
