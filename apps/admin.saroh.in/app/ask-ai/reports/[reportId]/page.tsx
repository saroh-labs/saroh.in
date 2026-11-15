import { Badge } from "@saroh/ui/badge";
import { FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { ResolveAiReport } from "@/components/ask-ai/ask-ai-actions";
import { Facts, Panel } from "@/components/panel";
import { read, readReport } from "@/lib/ask-ai";
import { REPORT_REASON_WORDS } from "@/lib/ask-ai-words";
import { requireStaff } from "@/lib/console";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Ask AI report" };

/**
 * One Ask AI report (DEC-220, U8): the question and answer the person
 * chose, and their note, exactly as copied when they reported it. Opening
 * it is on the admin ledger; `ai-reports:read` only.
 */
export default async function AskAiReportPage({
    params,
}: {
    params: Promise<{ reportId: string }>;
}) {
    const gate = await requireStaff("ai-reports:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const report = await read(readReport((await params).reportId));

    return (
        <AdminShell staff={staff}>
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Product", "Ask AI", "Report"]}
                    title={
                        report.status === "ok"
                            ? `Report from ${report.data.businessName}`
                            : "Report"
                    }
                    meta={
                        report.status === "ok" && (
                            <Badge
                                variant={
                                    report.data.status === "OPEN"
                                        ? "warning"
                                        : "success"
                                }
                            >
                                {report.data.status === "OPEN"
                                    ? "Open"
                                    : "Resolved"}
                            </Badge>
                        )
                    }
                />
                {report.status === "failed" ? (
                    <FailedState
                        title="This report could not be read"
                        description="It may have been deleted: reports are kept 90 days."
                    />
                ) : (
                    <Panel
                        title={REPORT_REASON_WORDS[report.data.reason]}
                        actions={
                            report.data.status === "OPEN" && (
                                <ResolveAiReport id={report.data.id} />
                            )
                        }
                    >
                        {() => (
                            <div className="grid gap-4">
                                <Facts
                                    rows={[
                                        [
                                            "Business",
                                            <Link
                                                key="b"
                                                href={`/businesses/${encodeURIComponent(report.data.organizationId)}`}
                                                className="underline underline-offset-4"
                                            >
                                                {report.data.businessName}
                                            </Link>,
                                        ],
                                        [
                                            "Reported",
                                            formatDateTime(
                                                report.data.createdAt,
                                            ),
                                        ],
                                        ["Note", report.data.note ?? "No note"],
                                    ]}
                                />
                                <Exchange
                                    label="Question"
                                    text={report.data.question}
                                />
                                <Exchange
                                    label="Answer"
                                    text={report.data.answer}
                                />
                                <Link
                                    href="/ask-ai"
                                    className="text-sm underline underline-offset-4"
                                >
                                    Back to Ask AI
                                </Link>
                            </div>
                        )}
                    </Panel>
                )}
            </PageContainer>
        </AdminShell>
    );
}

/** A reported text, plain: never read as markup. */
function Exchange({ label, text }: { label: string; text: string }) {
    return (
        <section className="grid gap-1">
            <h2 className="text-sm text-muted-foreground">{label}</h2>
            <p className="max-w-[72ch] whitespace-pre-line break-words rounded-lg border bg-muted/40 p-3 text-sm">
                {text || "—"}
            </p>
        </section>
    );
}
