import { Badge } from "@saroh/ui/badge";
import { Card, CardContent } from "@saroh/ui/card";

/**
 * The site settings screen's building blocks (Website › Settings audit):
 *
 * - `Group` — one of the six groups the in-page list jumps to (h2).
 * - `Section` — a titled card of rows inside a group (h3), shared with the
 *   rows that live in their own files (`sells-from-row.tsx`,
 *   `publish-approval-row.tsx`).
 * - `Row` — a label, the value, and the one action that changes it.
 *
 * Saving is live by default. A row that is part of the draft, and reaches
 * the live site only with the next publish, carries the "Next publish" pill
 * (`draft`), so the screen's two save models are told apart where the
 * merchant is looking, not in a paragraph halfway down.
 */

/** The pill on a draft-bound row. */
export const NEXT_PUBLISH = "Next publish";

export function Group({
    id,
    title,
    children,
}: {
    id: string;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section
            id={id}
            aria-labelledby={`${id}-title`}
            data-settings-group={id}
            className="scroll-mt-24 space-y-3"
        >
            <h2 id={`${id}-title`} className="text-base font-semibold">
                {title}
            </h2>
            <div className="space-y-4">{children}</div>
        </section>
    );
}

export function Section({
    title,
    description,
    badge,
    children,
}: {
    /** Left out when the group's own heading already says it. */
    title?: string;
    description?: string;
    badge?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-2">
            {title ? (
                <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{title}</h3>
                        {badge}
                    </div>
                    {description ? (
                        <p className="text-sm text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>
            ) : null}
            <Card className="wk-surface">
                <CardContent className="divide-y divide-border p-0">
                    {children}
                </CardContent>
            </Card>
        </div>
    );
}

/** The quiet mark on a row whose change waits for the next publish. */
export function NextPublishPill() {
    return (
        <Badge
            variant="neutral"
            data-saves="publish"
            className="shrink-0 px-2 py-0 text-[11px]"
        >
            {NEXT_PUBLISH}
        </Badge>
    );
}

export function Row({
    id,
    label,
    children,
    action,
    draft = false,
}: {
    /** For the checklist to jump to. */
    id?: string;
    label: string;
    children: React.ReactNode;
    action?: React.ReactNode;
    /** Part of the draft: reaches the live site with the next publish. */
    draft?: boolean;
}) {
    return (
        <div
            id={id}
            className="grid scroll-mt-24 items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
        >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>{label}</span>
                {draft ? <NextPublishPill /> : null}
            </div>
            <div className="min-w-0 text-sm">{children}</div>
            {action ? (
                <div className="justify-self-start sm:justify-self-end">
                    {action}
                </div>
            ) : (
                <div />
            )}
        </div>
    );
}

/** A value with where it comes from: "Rye · your site's name". */
export function InUse({
    value,
    source,
}: {
    value: React.ReactNode;
    source: string;
}) {
    return (
        <span className="[overflow-wrap:anywhere]">
            {value} <span className="text-muted-foreground">· {source}</span>
        </span>
    );
}

/** Nothing written, and nothing stands in for it: "Not written". */
export function Absent({ children }: { children: React.ReactNode }) {
    return <span className="text-muted-foreground">{children}</span>;
}
