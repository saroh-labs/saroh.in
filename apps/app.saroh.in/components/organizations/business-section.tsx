import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Lock } from "lucide-react";

/** One read-only line of a section: what it is, and what it is set to. */
export interface BusinessRow {
    label: string;
    /** Empty shows `empty` (or "Not set") in the muted colour. */
    value: string;
    empty?: string;
    mono?: boolean;
    /** A locked fact's reason, e.g. "From your first order". */
    tag?: string;
}

/**
 * One card of Business settings ("Saroh Settings" design): read first, and
 * edited one card at a time. Reading, it is a list of what is set and a note;
 * editing, its fields and a footer that says why Save is off.
 */
export function BusinessSection({
    title,
    pill,
    rows,
    note,
    editing,
    canEdit,
    onEdit,
    onCancel,
    saveOff,
    saving,
    saveWhy,
    children,
}: {
    title: string;
    pill?: { label: string; on: boolean };
    rows: BusinessRow[];
    note?: string;
    editing: boolean;
    canEdit: boolean;
    onEdit: () => void;
    onCancel: () => void;
    saveOff: boolean;
    saving: boolean;
    saveWhy: string;
    /** The section's fields, shown while editing. */
    children: React.ReactNode;
}) {
    return (
        <section
            aria-label={title}
            className="overflow-hidden rounded-xl border border-border bg-card"
        >
            <div className="flex min-h-[58px] flex-wrap items-center gap-2.5 border-b border-border/70 px-[18px] py-3">
                <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em]">
                    {title}
                </h3>
                {pill ? (
                    <Badge
                        variant={pill.on ? "success" : "neutral"}
                        className="uppercase tracking-[0.04em]"
                    >
                        {pill.label}
                    </Badge>
                ) : null}
                {canEdit && !editing ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                        onClick={onEdit}
                        aria-label={`Edit ${title.toLowerCase()}`}
                    >
                        Edit
                    </Button>
                ) : null}
            </div>

            {editing ? (
                <>
                    <div
                        className={cn(
                            "flex flex-wrap gap-4 px-[18px] py-4",
                            // The design's field scale, as `FormCard` sets it:
                            // a 12.5px label and an 11.5px note.
                            "[&_label]:text-[12.5px] [&_label]:font-medium",
                            "[&_[data-slot=form-description]]:text-[11.5px] [&_[data-slot=form-description]]:leading-[1.5]",
                        )}
                    >
                        {children}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-muted/50 px-[18px] py-3">
                        <span className="mr-auto text-[12px] text-muted-foreground">
                            {saveWhy}
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saveOff || saving}>
                            {saving ? "Saving…" : "Save"}
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    <dl>
                        {rows.map((row, i) => (
                            <div
                                key={row.label}
                                className={cn(
                                    "grid grid-cols-[minmax(110px,170px)_minmax(0,1fr)] gap-x-4 gap-y-1 px-[18px] py-[11px]",
                                    i > 0 && "border-t border-border/70",
                                )}
                            >
                                <dt className="text-[13px] text-muted-foreground">
                                    {row.label}
                                </dt>
                                <dd className="flex min-w-0 flex-wrap items-baseline gap-2">
                                    <span
                                        className={cn(
                                            "whitespace-pre-line text-[13.5px] [overflow-wrap:anywhere]",
                                            row.mono && "font-mono",
                                            !row.value &&
                                                "text-muted-foreground",
                                        )}
                                    >
                                        {row.value !== ""
                                            ? row.value
                                            : (row.empty ?? "Not set")}
                                    </span>
                                    {row.tag ? (
                                        <Badge
                                            variant="neutral"
                                            className="gap-1"
                                        >
                                            <Lock
                                                aria-hidden
                                                className="size-3"
                                            />
                                            {row.tag}
                                        </Badge>
                                    ) : null}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    {note ? (
                        <p className="text-pretty border-t border-border/70 bg-muted/50 px-[18px] pb-3 pt-2.5 text-[12px] leading-normal text-muted-foreground">
                            {note}
                        </p>
                    ) : null}
                </>
            )}
        </section>
    );
}
