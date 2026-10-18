import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { ReleaseTable } from "@/components/releases/release-table";
import { FailedPanel } from "@/components/states/failed-panel";
import { can } from "@/lib/console";
import { todayIso } from "@/lib/format";
import { readReleases, releasesGate } from "@/lib/release-data";

export const metadata = { title: "Releases" };

/**
 * Releases (R11): every release as a table, narrowed by state and search;
 * a row opens the release's own page. A business's own setting wins over
 * the default for everyone, which wins over off, so turning a release on
 * for some businesses is how a rollout starts.
 */
export default async function ReleasesPage() {
    const gate = await releasesGate();
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const read = await readReleases();
    if (read.status === "denied") {
        return <NotAuthorized email={staff.email} staff={staff} />;
    }

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Instance", "Releases"]}
                    title="Releases"
                    description="Turn a feature on for the right businesses, see who has it, and undo it if you're wrong. Turning it on or off for one business wins over the default for everyone. Every change records who made it and why."
                />
                {read.status === "failed" ? (
                    <FailedPanel things="releases" />
                ) : (
                    <ReleaseTable
                        flags={read.flags}
                        organizations={read.organizations}
                        canPublish={can(staff, "flags:publish")}
                        today={todayIso()}
                    />
                )}
            </PageContainer>
        </AdminShell>
    );
}
