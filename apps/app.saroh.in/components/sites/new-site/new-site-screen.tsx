"use client";

import type { TemplateKind } from "@saroh/templates";
import { FailedState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { PageHeader } from "@saroh/ui/page-header";
import { useQueryClient } from "@tanstack/react-query";

import { PageContainer } from "@/components/shared/page/page-container";
import { PageLoading } from "@/components/shared/page/page-loading";
import { CreateSiteForm } from "@/components/sites/new-site/create-site-form";
import { useOrgId } from "@/lib/query/org";
import { sitesKeys } from "@/lib/sites/queries";
import { startingTemplate } from "@/lib/sites/template-picker";
import { useNewSite, whenRefused } from "@/lib/sites/use-sites";

/**
 * New site (S2-004): the heading at once, the form when its catalogue,
 * suggested address and modules land (the form starts from them, so it
 * waits for them rather than resetting under someone typing). The page
 * has already said no to whoever may not make one, or to a business that
 * has its website; the gate facts (the business's kind, trade, the
 * template asked for) come from it.
 */
export function NewSiteScreen({
    choice,
    defaultTemplateId,
    asked,
    trade,
    tradeOther,
    kind,
    canSetTrade,
}: {
    choice: boolean;
    defaultTemplateId: string | null;
    /** `?template=`, else the one picked in the gallery at sign-up (DEC-216). */
    asked: string | null;
    trade: TemplateKind | null;
    tradeOther: string | null;
    kind: unknown;
    canSetTrade: boolean;
}) {
    const read = useNewSite();
    const qc = useQueryClient();
    const orgId = useOrgId();
    const data = read.data;
    if (read.isError && !data) whenRefused(read.error);
    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={[
                    <IntentLink data-ph-unmask="" key="site" href="/sites">
                        Website
                    </IntentLink>,
                    "New site",
                ]}
                title="New site"
                description={
                    choice
                        ? "Name your new site, check its web address and pick a template."
                        : "Name your new site and check its web address."
                }
            />
            {data ? (
                <CreateSiteForm
                    templates={data.templates}
                    choice={choice}
                    defaults={data.defaults}
                    defaultTemplateId={defaultTemplateId}
                    startTemplateId={startingTemplate(
                        data.templates ?? [],
                        asked,
                        defaultTemplateId,
                    )}
                    // The business's trade (DEC-216) suggests first.
                    trade={trade}
                    tradeOther={tradeOther}
                    kind={kind}
                    modules={data.modules}
                    canSetTrade={canSetTrade}
                    onRetry={() => void read.refetch()}
                    onCreated={() =>
                        void qc.invalidateQueries({
                            queryKey: sitesKeys(orgId),
                            refetchType: "none",
                        })
                    }
                />
            ) : read.isError ? (
                <FailedState
                    size="panel"
                    title={couldntLoad("the site form")}
                    onRetry={() => void read.refetch()}
                    retrying={read.isFetching}
                />
            ) : (
                <PageLoading
                    shape="form"
                    width="form"
                    bare
                    label="Loading the site form"
                />
            )}
        </PageContainer>
    );
}
