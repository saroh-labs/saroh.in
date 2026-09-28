import { Badge } from "@saroh/ui/badge";
import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import type { ReactNode } from "react";

/**
 * The card each part of a storefront's settings sits in, and the note under
 * a control ("Saroh Storefront Settings" design): an 11px uppercase label,
 * then the controls 20px apart. Shared by `storefronts-screen.tsx` and the
 * sections split out of it.
 */
export function Section({
    title,
    id,
    children,
}: {
    title: string;
    /** For a link straight to this card. */
    id?: string;
    children: ReactNode;
}) {
    return (
        <section
            id={id}
            aria-label={title}
            className="scroll-mt-6 rounded-xl border border-border px-5 py-[18px]"
        >
            <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {title}
            </h2>
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
 * A switch with its label and the note under it (the design's TOGGLES
 * rows), which saves the moment it is flipped.
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
    note: string;
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
