"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { PageHeader } from "@saroh/ui/page-header";
import { Globe } from "lucide-react";

import { PageContainer } from "@/components/shared/page/page-container";
import { PageLoading } from "@/components/shared/page/page-loading";
import { AllSites } from "@/components/sites/all-sites/all-sites";
import { useAllSites, whenRefused } from "@/lib/sites/use-sites";

const newSite = (
    <Button asChild>
        <IntentLink href="/sites/new">New site</IntentLink>
    </Button>
);

/**
 * Website, from the rail (plan 2026-11-18-001 U3): All sites. The heading
 * at once; the cards, and New site while another may be made, when the
 * list lands. A business with none is shown the way to make one, in words
 * for who is looking: a REVIEWER is waiting to be asked to look at one, a
 * MEMBER cannot make one (#313). `mayCreate` is the page's gate: by what
 * the role was given (`site:create`), never by its name.
 */
export function AllSitesScreen({
    mayCreate,
    reviewer,
}: {
    mayCreate: boolean;
    reviewer: boolean;
}) {
    const read = useAllSites();
    const data = read.data;

    if (data?.sites.length === 0) {
        const nothingHere = reviewer
            ? {
                  title: "Nothing to review yet",
                  description:
                      "A website appears here when someone asks you to look at it.",
              }
            : {
                  title: "No website yet",
                  description: mayCreate
                      ? "Make one and it is yours to edit before anyone can see it."
                      : "Its pages and posts show here once there is one.",
              };
        return (
            <PageContainer width="full">
                <div className="flex flex-col gap-6">
                    <PageHeader
                        breadcrumb={["Website"]}
                        title="Website"
                        className="mb-0"
                    />
                    <EmptyState
                        data-ph-unmask=""
                        icon={<Globe />}
                        title={nothingHere.title}
                        description={nothingHere.description}
                        action={mayCreate ? newSite : undefined}
                    />
                </div>
            </PageContainer>
        );
    }

    if (read.isError) whenRefused(read.error);
    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Sites"
                    className="mb-0"
                    actions={
                        mayCreate && data?.canAddMore ? newSite : undefined
                    }
                />
                {data ? (
                    <AllSites sites={data.sites} />
                ) : read.isError ? (
                    <FailedState
                        size="panel"
                        title={couldntLoad("your sites")}
                        onRetry={() => void read.refetch()}
                        retrying={read.isFetching}
                    />
                ) : (
                    <PageLoading
                        shape="panels"
                        width="full"
                        bare
                        label="Loading your sites"
                    />
                )}
            </div>
        </PageContainer>
    );
}
