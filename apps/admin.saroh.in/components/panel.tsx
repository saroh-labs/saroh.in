import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { FailedState } from "@saroh/ui/data-state";
import type { ReactNode } from "react";

/**
 * A titled block on a console screen. When its data failed to load it says
 * so in place and leaves the rest of the screen standing — one panel's
 * failure is never the whole page's.
 */
export function Panel<T>({
    title,
    description,
    actions,
    data,
    children,
}: {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    data?: { status: "ok"; data: T } | { status: "failed" };
    children: (data: T) => ReactNode;
}) {
    return (
        <Card className="min-w-0">
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                    <CardTitle className="text-[15px]">{title}</CardTitle>
                    {description && (
                        <CardDescription className="mt-1">
                            {description}
                        </CardDescription>
                    )}
                </div>
                {actions && (
                    <div className="flex flex-wrap gap-2">{actions}</div>
                )}
            </CardHeader>
            <CardContent className="min-w-0">
                {data?.status === "failed" ? (
                    <FailedState
                        title={`${title} could not be loaded`}
                        description="The rest of the page is current. Reload to try this part again."
                    />
                ) : (
                    children((data as { data: T } | undefined)?.data as T)
                )}
            </CardContent>
        </Card>
    );
}

/** A two-column list of facts: a label, then its value. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[minmax(120px,auto)_1fr]">
            {rows.map(([label, value]) => (
                <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                </div>
            ))}
        </dl>
    );
}
