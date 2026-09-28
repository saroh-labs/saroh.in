import { Card, CardContent } from "@saroh/ui/card";

/**
 * The site settings screen's building blocks: a titled card of rows, each a
 * label, the value, and the one action that changes it. Shared by
 * `site-settings.tsx` and the rows that live in their own files
 * (`sells-from-row.tsx`, G11).
 */

export function Section({
    title,
    description,
    badge,
    children,
}: {
    title: string;
    description: string;
    badge?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    {badge}
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Card className="wk-surface">
                <CardContent className="divide-y divide-border p-0">
                    {children}
                </CardContent>
            </Card>
        </section>
    );
}

export function Row({
    label,
    children,
    action,
}: {
    label: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="grid items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
            <div className="text-sm text-muted-foreground">{label}</div>
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
