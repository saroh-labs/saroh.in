import { PageContainer } from "@saroh/ui/page-container";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { ReleaseHeader } from "@/components/releases/release-header";
import { ReleaseTabs } from "@/components/releases/release-tabs";
import { FailedPanel } from "@/components/states/failed-panel";
import { can } from "@/lib/console";
import { readReleases, releasesGate } from "@/lib/release-data";

/**
 * One release's page (R11): its header and actions, then its tabs, each its
 * own address: Overview · Who has it · History · About.
 */
export default async function ReleaseLayout({
    params,
    children,
}: {
    params: Promise<{ key: string }>;
    children: ReactNode;
}) {
    const gate = await releasesGate();
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const { key } = await params;
    const read = await readReleases();
    if (read.status === "denied") {
        return <NotAuthorized email={staff.email} staff={staff} />;
    }
    if (read.status === "failed") {
        return (
            <AdminShell staff={staff}>
                <PageContainer>
                    <FailedPanel things="this release" />
                </PageContainer>
            </AdminShell>
        );
    }
    const flag = read.flags.find((f) => f.key === decodeURIComponent(key));
    if (!flag) notFound();

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <ReleaseHeader
                    flag={flag}
                    organizations={read.organizations}
                    canPublish={can(staff, "flags:publish")}
                />
                <ReleaseTabs releaseKey={flag.key} />
                {children}
            </PageContainer>
        </AdminShell>
    );
}
