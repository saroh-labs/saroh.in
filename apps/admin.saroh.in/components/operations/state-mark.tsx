import {
    AlertTriangle,
    CheckCircle2,
    CircleDashed,
    XCircle,
} from "lucide-react";

import type { CheckState } from "@/lib/machinery";

const MARK: Record<
    CheckState,
    { label: string; icon: typeof CheckCircle2; className: string }
> = {
    ok: { label: "Working", icon: CheckCircle2, className: "text-success" },
    warn: {
        label: "Look at this",
        icon: AlertTriangle,
        className: "text-warning",
    },
    failed: { label: "Broken", icon: XCircle, className: "text-destructive" },
    unmeasured: {
        label: "Not measured here",
        icon: CircleDashed,
        className: "text-muted-foreground",
    },
};

/** A check's state as a word and a shape, never colour alone. */
export function StateMark({ state }: { state: CheckState }) {
    const mark = MARK[state];
    const Icon = mark.icon;
    return (
        <span
            className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${mark.className}`}
        >
            <Icon aria-hidden className="size-4 shrink-0" />
            {mark.label}
        </span>
    );
}
