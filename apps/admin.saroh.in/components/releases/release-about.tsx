import { Badge } from "@saroh/ui/badge";

import type { AdminFlag } from "@/lib/control-plane";
import { groupLabel, reviewOverdue } from "@/lib/releases";

/** What a release is for and when it can go: the clean-up facts (R11). */
export function AboutRelease({
    flag,
    today,
}: {
    flag: AdminFlag;
    today: string;
}) {
    return (
        <dl className="grid max-w-[68ch] gap-3 text-sm">
            <Fact label="What it's for">{flag.metadata.purpose}</Fact>
            <Fact label="Code name">
                <code className="break-all font-mono">{flag.key}</code>
            </Fact>
            <Fact label="Kind">{groupLabel(flag.metadata.group)}</Fact>
            <Fact label="Looked after by">{flag.metadata.owner}</Fact>
            <Fact label="Check whether it's still needed by">
                <span className="flex flex-wrap items-center gap-2">
                    {flag.metadata.reviewBy}
                    {reviewOverdue(flag, today) && (
                        <Badge variant="warning">Review overdue</Badge>
                    )}
                </span>
            </Fact>
            <Fact label="Can be removed when">{flag.metadata.removeWhen}</Fact>
        </dl>
    );
}

function Fact({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid gap-0.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{children}</dd>
        </div>
    );
}
