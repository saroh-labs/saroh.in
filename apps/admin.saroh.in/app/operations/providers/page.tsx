import { Badge } from "@saroh/ui/badge";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { RecheckDomain } from "@/components/operations/recheck-domain";
import { Panel } from "@/components/panel";
import { can, requireStaff } from "@/lib/console";
import { asWords, formatRelative } from "@/lib/format";
import { getProviders } from "@/lib/machinery";

export const metadata = { title: "Providers" };

/**
 * Provider connections across the instance (plan U8, R15): payments,
 * messaging and domains — how many businesses have each working, which have
 * one that stopped, and the domains still waiting on DNS, each of which can
 * be checked again now.
 */
export default async function ProvidersPage() {
    const gate = await requireStaff("providers:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const providers = await getProviders().catch(() => undefined);
    const canRecheck = can(staff, "providers:recheck");

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Operations", "Providers"]}
                    title="Providers"
                    description="The payment, messaging and domain connections businesses rely on."
                />
                {!providers ? (
                    <FailedState title="Providers could not be read" />
                ) : (
                    <>
                        <div className="grid gap-6 md:grid-cols-2">
                            <Panel title="Payments">
                                {() => (
                                    <Counts
                                        rows={providers.payments.map((row) => ({
                                            label: row.provider,
                                            status: row.status,
                                            count: row.count,
                                        }))}
                                    />
                                )}
                            </Panel>
                            <Panel title="Messaging">
                                {() => (
                                    <Counts
                                        rows={providers.messaging.map(
                                            (row) => ({
                                                label: `${row.provider} · ${asWords(row.channel)}`,
                                                status: row.status,
                                                count: row.count,
                                            }),
                                        )}
                                    />
                                )}
                            </Panel>
                        </div>
                        <Panel
                            title="Domains"
                            description={
                                providers.domains
                                    .map(
                                        (row) =>
                                            `${row.count} ${asWords(row.status).toLowerCase()}`,
                                    )
                                    .join(" · ") || "No custom domains."
                            }
                        >
                            {() =>
                                providers.waitingDomains.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        Every custom domain is verified.
                                    </p>
                                ) : (
                                    <ul className="grid gap-3">
                                        {providers.waitingDomains.map(
                                            (domain) => (
                                                <li
                                                    key={domain.id}
                                                    className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                                                >
                                                    <div className="grid min-w-0 gap-0.5">
                                                        <span className="break-all font-mono text-[13px]">
                                                            {domain.hostname}
                                                        </span>
                                                        <span className="text-[13px] text-muted-foreground">
                                                            <Link
                                                                href={`/businesses/${domain.organization.id}`}
                                                                className="underline-offset-4 hover:underline"
                                                            >
                                                                {
                                                                    domain
                                                                        .organization
                                                                        .name
                                                                }
                                                            </Link>{" "}
                                                            · last checked{" "}
                                                            {formatRelative(
                                                                domain.lastCheckedAt,
                                                            )}
                                                            {domain.lastCheckResult &&
                                                                ` · ${asWords(domain.lastCheckResult)}`}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge
                                                            variant={
                                                                domain.status ===
                                                                "FAILED"
                                                                    ? "error"
                                                                    : "warning"
                                                            }
                                                        >
                                                            {asWords(
                                                                domain.status,
                                                            )}
                                                        </Badge>
                                                        {canRecheck && (
                                                            <RecheckDomain
                                                                domainId={
                                                                    domain.id
                                                                }
                                                            />
                                                        )}
                                                    </div>
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                )
                            }
                        </Panel>
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}

function Counts({
    rows,
}: {
    rows: { label: string; status: string; count: number }[];
}) {
    if (rows.length === 0) {
        return (
            <EmptyState
                title="None connected"
                description="No business has connected one yet."
            />
        );
    }
    return (
        <ul className="grid gap-2 text-sm">
            {rows.map((row) => (
                <li
                    key={`${row.label}-${row.status}`}
                    className="flex items-center justify-between gap-3"
                >
                    <span className="min-w-0 truncate">{row.label}</span>
                    <span className="flex items-center gap-2">
                        <Badge
                            variant={
                                row.status === "CONNECTED"
                                    ? "success"
                                    : "warning"
                            }
                        >
                            {row.status === "CONNECTED"
                                ? "Working"
                                : asWords(row.status)}
                        </Badge>
                        <span className="w-8 text-right tabular-nums">
                            {row.count}
                        </span>
                    </span>
                </li>
            ))}
        </ul>
    );
}
