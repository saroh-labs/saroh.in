import { Badge } from "@saroh/ui/badge";
import { EmptyState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import {
    AiHaltSwitch,
    DecideAiRequest,
    SetAiSetting,
} from "@/components/ask-ai/ask-ai-actions";
import { Facts, Panel } from "@/components/panel";
import {
    read,
    readReports,
    readRequests,
    readSettingHistory,
    readSettings,
    readSummary,
} from "@/lib/ask-ai";
import {
    dollarsOf,
    failedWords,
    REPORT_REASON_WORDS,
    REQUEST_STATUS_WORDS,
    settingValueWords,
} from "@/lib/ask-ai-words";
import { can, requireStaff } from "@/lib/console";
import { formatDateTime, formatRelative } from "@/lib/format";
import { param } from "@/lib/params";

export const metadata = { title: "Ask AI" };

/**
 * Ask AI (DEC-220, plan 2026-11-13-001 U8): today's spend and failures,
 * the Saroh-wide halt, the AI settings with their history, Request more,
 * and what people reported. Anyone who reads the console sees the numbers
 * and settings; `ai-settings:write` (Platform owners) changes them, halts
 * and grants; `organization:read` lists requests; `ai-reports:read` lists
 * reports, each opened on its own page and on the ledger.
 */
export default async function AskAiPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("platform:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const historyKey = param((await searchParams).history);
    const canWrite = can(staff, "ai-settings:write");
    const seesRequests = can(staff, "organization:read");
    const seesReports = can(staff, "ai-reports:read");

    const [summary, settings, history, requests, reports] = await Promise.all([
        read(readSummary()),
        read(readSettings()),
        historyKey ? read(readSettingHistory(historyKey)) : undefined,
        seesRequests ? read(readRequests()) : undefined,
        seesReports ? read(readReports("OPEN")) : undefined,
    ]);
    const halted = summary.status === "ok" && summary.data.halted;

    return (
        <AdminShell staff={staff}>
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Product", "Ask AI"]}
                    title="Ask AI"
                    description={`What Ask AI costs and how it is doing today, its settings, and what businesses asked for or reported.${canWrite ? "" : " Read-only: your role doesn't include changing it."}`}
                    meta={
                        summary.status === "ok" && (
                            <Badge dot variant={halted ? "warning" : "success"}>
                                {halted ? "Halted" : "Running"}
                            </Badge>
                        )
                    }
                />
                <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
                    <Panel
                        title="Today"
                        description="UTC days and months, every question counted or not."
                        actions={
                            canWrite &&
                            summary.status === "ok" && (
                                <AiHaltSwitch halted={halted} />
                            )
                        }
                        data={summary}
                    >
                        {(s) => (
                            <Facts
                                rows={[
                                    ...(s.halted
                                        ? ([
                                              [
                                                  "Halted because",
                                                  s.haltReason ?? "—",
                                              ],
                                          ] as [string, string][])
                                        : []),
                                    [
                                        "Spent today",
                                        dollarsOf(s.spentTodayMicroUsd),
                                    ],
                                    [
                                        "Spent this month",
                                        dollarsOf(s.spentThisMonthMicroUsd),
                                    ],
                                    ["Last hour", failedWords(s.lastHour)],
                                    ["Today", failedWords(s.today)],
                                    [
                                        "Requests waiting",
                                        String(s.openRequests),
                                    ],
                                    ["Reports open", String(s.openReports)],
                                ]}
                            />
                        )}
                    </Panel>

                    <Panel
                        title="Settings"
                        description="Each change is a new row with a reason; the newest in effect applies. A setting nobody has set leaves Ask AI unavailable."
                        data={settings}
                    >
                        {(rows) => (
                            <ul className="grid divide-y text-sm">
                                {rows.map((s) => (
                                    <li
                                        key={s.key}
                                        className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                                    >
                                        <span className="font-mono text-[13px]">
                                            {s.key}
                                        </span>
                                        <span className="min-w-0 break-all font-mono text-[13px] text-muted-foreground">
                                            {s.current
                                                ? settingValueWords(
                                                      s.current.value,
                                                  )
                                                : "Not set"}
                                        </span>
                                        <span className="ml-auto flex items-center gap-2">
                                            <Link
                                                href={`/ask-ai?history=${encodeURIComponent(s.key)}`}
                                                className="underline underline-offset-4"
                                            >
                                                History
                                            </Link>
                                            {canWrite && (
                                                <SetAiSetting
                                                    settingKey={s.key}
                                                    current={s.current?.value}
                                                />
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>

                    {historyKey && history && (
                        <Panel
                            title={`History of ${historyKey}`}
                            actions={
                                <Link
                                    href="/ask-ai"
                                    className="text-sm underline underline-offset-4"
                                >
                                    Close
                                </Link>
                            }
                            data={history}
                        >
                            {(rows) =>
                                rows.length === 0 ? (
                                    <EmptyState title="Never set" />
                                ) : (
                                    <ul className="grid divide-y text-sm">
                                        {rows.map((r) => (
                                            <li
                                                key={r.id}
                                                className="grid gap-1 py-2"
                                            >
                                                <span className="break-all font-mono text-[13px]">
                                                    {settingValueWords(r.value)}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {r.reason} ·{" "}
                                                    {formatDateTime(
                                                        r.effectiveFrom,
                                                    )}{" "}
                                                    · {r.setByUserId}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )
                            }
                        </Panel>
                    )}

                    {requests && (
                        <Panel
                            title="Request more"
                            description="Businesses that ran out of questions this period. A grant adds one pack for this period only."
                            data={requests}
                        >
                            {(rows) =>
                                rows.length === 0 ? (
                                    <EmptyState title="No requests yet" />
                                ) : (
                                    <ul className="grid divide-y text-sm">
                                        {rows.map((r) => (
                                            <li
                                                key={r.id}
                                                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                                            >
                                                <Link
                                                    href={`/businesses/${encodeURIComponent(r.organizationId)}`}
                                                    className="font-medium underline underline-offset-4"
                                                >
                                                    {r.businessName}
                                                </Link>
                                                <Badge
                                                    variant={
                                                        r.status === "OPEN"
                                                            ? "warning"
                                                            : "info"
                                                    }
                                                >
                                                    {
                                                        REQUEST_STATUS_WORDS[
                                                            r.status
                                                        ]
                                                    }
                                                </Badge>
                                                <span
                                                    className="text-muted-foreground"
                                                    title={formatDateTime(
                                                        r.createdAt,
                                                    )}
                                                >
                                                    {formatRelative(
                                                        r.createdAt,
                                                    )}
                                                </span>
                                                {r.reason && (
                                                    <span className="text-muted-foreground">
                                                        {r.reason}
                                                    </span>
                                                )}
                                                {r.packsEndAt && (
                                                    <span className="text-muted-foreground">
                                                        {r.packsRemovedAt
                                                            ? "Ended"
                                                            : `Ends ${formatDateTime(r.packsEndAt)}`}
                                                    </span>
                                                )}
                                                {canWrite &&
                                                    r.status === "OPEN" && (
                                                        <span className="ml-auto">
                                                            <DecideAiRequest
                                                                id={r.id}
                                                                business={
                                                                    r.businessName
                                                                }
                                                            />
                                                        </span>
                                                    )}
                                            </li>
                                        ))}
                                    </ul>
                                )
                            }
                        </Panel>
                    )}

                    {reports && (
                        <Panel
                            title="Reports"
                            description="Answers people reported, open ones. Opening one shows the question and answer, and is kept in the audit trail."
                            data={reports}
                        >
                            {(rows) =>
                                rows.length === 0 ? (
                                    <EmptyState title="No open reports" />
                                ) : (
                                    <ul className="grid divide-y text-sm">
                                        {rows.map((r) => (
                                            <li
                                                key={r.id}
                                                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                                            >
                                                <Link
                                                    href={`/ask-ai/reports/${encodeURIComponent(r.id)}`}
                                                    className="font-medium underline underline-offset-4"
                                                >
                                                    {r.businessName}
                                                </Link>
                                                <span>
                                                    {
                                                        REPORT_REASON_WORDS[
                                                            r.reason
                                                        ]
                                                    }
                                                </span>
                                                <span
                                                    className="ml-auto text-muted-foreground"
                                                    title={formatDateTime(
                                                        r.createdAt,
                                                    )}
                                                >
                                                    {formatRelative(
                                                        r.createdAt,
                                                    )}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )
                            }
                        </Panel>
                    )}
                </div>
            </PageContainer>
        </AdminShell>
    );
}
