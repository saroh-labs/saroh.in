import { Badge } from "@saroh/ui/badge";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Switch } from "@saroh/ui/switch";
import type { ReactNode } from "react";

/**
 * One tab's part of a location's page (The place, Payments, Delivery,
 * Customers, People, Pause or close), and the note under a control. No card and no
 * visible title: the tab strip names it and frames it, so the panel is the
 * controls alone, 20px apart, with an sr-only heading for the outline.
 * Shared by `storefronts-screen.tsx` and the sections split out of it.
 */
export function Section({
    title,
    id,
    action,
    className,
    children,
}: {
    title: string;
    /** For a link straight to this card, and the page's section list. */
    id?: string;
    /** Something beside the title: a status, or a link elsewhere. */
    action?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    const headingId = id ? `${id}-heading` : undefined;
    return (
        <section
            id={id}
            aria-labelledby={headingId}
            aria-label={headingId ? undefined : title}
            // Clear of the sticky app header when a link jumps here.
            className={cn("scroll-mt-20 pt-1", className)}
        >
            {/* The tab already names it on screen; the heading keeps the
                page's outline for a screen reader. */}
            <h2 id={headingId} className="sr-only">
                {title}
            </h2>
            {action ? <div className="mb-4">{action}</div> : null}
            <div className="flex flex-col gap-5">{children}</div>
        </section>
    );
}

export function Note({ id, children }: { id?: string; children: ReactNode }) {
    return (
        <p
            id={id}
            className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
        >
            {children}
        </p>
    );
}

/**
 * A switch with its label and the line under it, which saves the moment it
 * is flipped.
 */
export function ToggleRow({
    id,
    label,
    note,
    later,
    checked,
    disabled,
    onChange,
}: {
    id: string;
    label: string;
    note: ReactNode;
    /** Saved, but nothing reads it until customers can check out alone. */
    later?: boolean;
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={id} className="text-[13.5px] font-medium">
                        {label}
                    </Label>
                    {later ? (
                        <Badge variant="neutral">Not live yet</Badge>
                    ) : null}
                </span>
                <p
                    id={`${id}-note`}
                    className="mt-0.5 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
                >
                    {note}
                </p>
            </div>
            <Switch
                id={id}
                checked={checked}
                disabled={disabled}
                aria-describedby={`${id}-note`}
                onCheckedChange={onChange}
                className="mt-0.5 shrink-0"
            />
        </div>
    );
}
