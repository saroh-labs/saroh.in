import { PageHeader } from "@saroh/ui/page-header";

import { ProjectModuleSelector } from "@/components/projects/project-module-selector";
import { listModules } from "@/lib/modules/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Project modules (ADR-003 / #116). Lets OWNER/ADMIN choose which of
 * the Organization's enabled modules appear in a given Project; the API enforces
 * the role and same-Organization ownership. Server component — fetches effective
 * availability scoped to this Project once and hands it to the selector.
 */
export const metadata = { title: "Project modules" };

export default async function ProjectModulesPage({
    params,
}: {
    params: Promise<{ projectId: string }>;
}) {
    await requireSession();
    const { projectId } = await params;
    const modules = await listModules(projectId);

    return (
        <main className="mx-auto max-w-3xl p-8">
            <PageHeader
                title="Project modules"
                description="Choose which of your organization's modules appear in this project. Organization settings always take precedence."
            />
            <ProjectModuleSelector projectId={projectId} modules={modules} />
        </main>
    );
}
