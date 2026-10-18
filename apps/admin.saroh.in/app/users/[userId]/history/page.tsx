import { Badge } from "@saroh/ui/badge";

import { Panel } from "@/components/panel";
import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import { requireStaff } from "@/lib/console";
import { formatDateTime } from "@/lib/format";
import { getPersonHistory } from "@/lib/people";
import { historyWords } from "@/lib/sign-in-words";

export const metadata = { title: "User · History" };

/**
 * What Saroh staff did to this user, newest first (admin console U9): sign-in
 * help, sign-outs and changes to their place in a business, each with who
 * and why. Opening their page is not listed; the audit trail has that.
 */
export default async function UserHistory({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const gate = await requireStaff("organization:pii:read");
    if (!gate.ok) return null;
    const { userId } = await params;
    const items = await getPersonHistory(userId).catch(() => undefined);

    if (items === undefined) return <FailedPanel things="history" />;
    if (items === null || items.length === 0) {
        return (
            <EmptyPanel
                title="Nothing yet"
                description="What Saroh staff do to this account shows here, with who did it and why."
            />
        );
    }
    return (
        <Panel
            title="History"
            description="The last 50 things Saroh staff did to this account."
        >
            {() => (
                <ol className="grid divide-y">
                    {items.map((item) => (
                        <li
                            key={item.id}
                            className="grid gap-1 py-3 first:pt-0 last:pb-0"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">
                                    {historyWords(item.action)}
                                </span>
                                {item.outcome !== "SUCCESS" && (
                                    <Badge variant="warning">
                                        {item.outcome === "DENIED"
                                            ? "Refused"
                                            : "Failed"}
                                    </Badge>
                                )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {item.actorName ??
                                    "A staff member who has left"}{" "}
                                ·{" "}
                                <time dateTime={item.createdAt}>
                                    {formatDateTime(item.createdAt)}
                                </time>
                            </div>
                            {item.reason && (
                                <div className="break-words text-sm">
                                    “{item.reason}”
                                </div>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </Panel>
    );
}
