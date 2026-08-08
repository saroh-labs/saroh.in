import { PageHeader } from "@saroh/ui/page-header";

import { ModuleGoalPicker } from "@/components/modules/module-goal-picker";
import { listModules } from "@/lib/modules/service";
import { requireSession } from "@/lib/session";

/**
 * Need-based module onboarding (#119, Task 3). Reached after creating an
 * Organization (from Home's empty state) or any time from Settings. Asks what
 * the business needs to do and enables the matching modules; skipping is allowed.
 */
export const metadata = { title: "What do you need?" };

export default async function OnboardingModulesPage() {
    await requireSession();
    const modules = await listModules();

    return (
        <main className="mx-auto w-full max-w-2xl px-6 py-16">
            <PageHeader
                title="What does your business need to do?"
                description="Pick what you need to start with. Nothing is locked in — add or remove capabilities later without losing data."
            />
            <ModuleGoalPicker modules={modules} />
        </main>
    );
}
