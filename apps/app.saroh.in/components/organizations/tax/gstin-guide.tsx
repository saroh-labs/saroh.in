import { cn } from "@saroh/ui/lib/utils";

import { gstinParts } from "@/lib/invoices/gstin";

/**
 * The GSTIN's five parts under the field, filling in as they are typed:
 * state code, PAN, entity number, the Z, and the check character. What is
 * typed shows in ink, what is still to come in the example's characters,
 * greyed; the part that is wrong turns red. So "15 characters" stops being a
 * number to count to and becomes a shape to fill.
 *
 * Decorative for a screen reader — the field's own message says the same in
 * words (`gstinProblem`).
 */
export function GstinGuide({ value }: { value: string }) {
    const parts = gstinParts(value);
    return (
        <div aria-hidden className="flex flex-wrap items-end gap-1.5">
            {parts.map((p) => {
                const rest = p.example.slice(p.typed.length);
                return (
                    <div
                        key={p.key}
                        className="flex flex-col items-start gap-1"
                    >
                        <span
                            className={cn(
                                "rounded-md border px-1.5 py-1 font-mono text-[13px] leading-none tracking-[0.06em]",
                                p.state === "wrong"
                                    ? "border-destructive/50 bg-destructive-subtle text-destructive"
                                    : p.state === "done"
                                      ? "border-border bg-card text-foreground"
                                      : "border-dashed border-border-strong bg-muted/40",
                            )}
                        >
                            <span>{p.typed}</span>
                            <span className="text-muted-foreground/60">
                                {rest}
                            </span>
                        </span>
                        <span
                            className={cn(
                                "text-[10.5px] leading-none",
                                p.state === "wrong"
                                    ? "text-destructive"
                                    : "text-muted-foreground",
                            )}
                        >
                            {p.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
