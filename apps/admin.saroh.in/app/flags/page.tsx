import { cn } from "@saroh/ui/lib/utils";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { ReleaseDetail } from "@/components/releases/release-detail";
import { ReleaseList } from "@/components/releases/release-list";
import { requireStaff } from "@/lib/console";
import {
    explainFlag,
    flagHistory,
    listFlags,
    listOrganizations,
} from "@/lib/control-plane";
import { todayIso } from "@/lib/format";
import { firstRelease } from "@/lib/releases";

/**
 * Releases — the rollout control surface (S1-012, DEC feature-flags), as two
 * panes (Releases audit, 8 Oct): pick a release on the left; who has it, its
 * history and its clean-up facts on the right. The choice is in the URL
 * (`?release=KEY`), so a release can be linked, and on a phone the list and
 * the release are each their own view.
 *
 * Precedence is a business's own setting > the default for everyone > off,
 * so an own setting is the targeted-rollout lever and clearing it returns
 * the business to the default.
 */
export const metadata = { title: "Releases" };

export default async function FlagsPage({
    searchParams,
}: {
    searchParams: Promise<{
        release?: string;
        /** The earlier inspector's name for it; old links still land. */
        flag?: string;
        organizationId?: string;
    }>;
}) {
    const gate = await requireStaff("flags:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;

    const params = await searchParams;
    const asked = params.release ?? params.flag;
    const [flags, organizations] = await Promise.all([
        listFlags(),
        listOrganizations(),
    ]);
    if (!flags || !organizations) {
        return <NotAuthorized email={staff.email} staff={staff} />;
    }
    const selected =
        flags.find((flag) => flag.key === asked) ?? firstRelease(flags);
    const [history, explanation] = selected
        ? await Promise.all([
              flagHistory(selected.key).catch(() => null),
              params.organizationId
                  ? explainFlag(selected.key, params.organizationId).catch(
                        () => null,
                    )
                  : null,
          ])
        : [null, null];
    const today = todayIso();
    // On a phone, a page opened with no release chosen is the list alone.
    const showingDetail = Boolean(asked);

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Instance", "Releases"]}
                    title="Releases"
                    description="Turn a feature on for the right businesses, see who has it, and undo it if you're wrong. A business's own setting wins over the default for everyone, which wins over off. Every change records who made it and why."
                />

                <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:gap-8">
                    <div
                        className={cn(
                            "min-w-0 lg:block",
                            showingDetail && "hidden",
                        )}
                    >
                        <ReleaseList
                            flags={flags}
                            selectedKey={selected?.key}
                            today={today}
                        />
                    </div>
                    <div
                        className={cn(
                            "min-w-0 lg:block lg:border-l lg:pl-8",
                            !showingDetail && "hidden",
                        )}
                    >
                        {selected ? (
                            <ReleaseDetail
                                flag={selected}
                                organizations={organizations}
                                history={history}
                                canPublish={staff.permissions.includes(
                                    "flags:publish",
                                )}
                                explained={
                                    explanation && params.organizationId
                                        ? {
                                              organizationId:
                                                  params.organizationId,
                                              explanation,
                                          }
                                        : null
                                }
                                today={today}
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No releases are registered.
                            </p>
                        )}
                    </div>
                </div>
            </PageContainer>
        </AdminShell>
    );
}
