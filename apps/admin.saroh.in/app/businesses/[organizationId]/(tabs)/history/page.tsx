import { HistoryList } from "@/components/business/history-list";
import { SessionTab } from "@/components/business/session-tab";
import { Panel } from "@/components/panel";
import type { BusinessTabProps } from "@/lib/business-page";
import { businessGate, tabTitle } from "@/lib/business-page";
import { mergeHistory } from "@/lib/business-words";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("History", organizationId) };
}

/**
 * History (admin plan U6): what the business did itself and what Saroh's
 * team did to it, merged into one list, newest first. Staff lines carry
 * who and why, so it reads inside a support session.
 */
export default async function HistoryTab({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;

    return (
        <SessionTab staff={staff} organizationId={organizationId}>
            {(view) => {
                const missing = [
                    view.activity.status === "failed"
                        ? "the business's own activity"
                        : null,
                    view.operatorActions.status === "failed"
                        ? "what Saroh's team did"
                        : null,
                ].filter((side): side is string => side !== null);
                const rows = mergeHistory(
                    view.activity.status === "ok" ? view.activity.data : [],
                    view.operatorActions.status === "ok"
                        ? view.operatorActions.data
                        : [],
                );
                return (
                    <Panel
                        title="History"
                        description="What the business did, and what Saroh's team did to it, newest first. Each change by the team shows who made it and why."
                    >
                        {() => <HistoryList rows={rows} missing={missing} />}
                    </Panel>
                );
            }}
        </SessionTab>
    );
}
