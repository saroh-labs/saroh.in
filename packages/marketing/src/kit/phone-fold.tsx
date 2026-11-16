import { ChevronDown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../cn";
import { ring } from "../ring";

/**
 * A fold on a phone only (PHONE.md, the indexing rule): from 760px the
 * content shows as it is; under it the content sits behind `summary`, in
 * the HTML once (no copy for the phone), shown when the summary's
 * `<details>` opens. Closed, it is `display: none`, as a closed details'
 * content is, so nothing hidden can take focus.
 */
export function PhoneFold({
    summary,
    children,
    tone = "ink",
    className,
}: {
    summary: ReactNode;
    children: ReactNode;
    tone?: "ink" | "on-ink";
    className?: string;
}) {
    return (
        <div className={cn("group/pf", className)}>
            <details className="group min-[760px]:hidden">
                <summary
                    className={cn(
                        "inline-flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-sm font-semibold underline decoration-1 underline-offset-[3px] [&::-webkit-details-marker]:hidden",
                        tone === "ink"
                            ? "text-foreground decoration-border-strong"
                            : "text-mk-lamp-fg decoration-mk-on-ink-line",
                        ring(),
                    )}
                >
                    {summary}
                    <ChevronDown
                        aria-hidden
                        className="size-[18px] shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    />
                </summary>
            </details>
            <div className="max-[759px]:hidden max-[759px]:group-has-[>details[open]]/pf:block">
                {children}
            </div>
        </div>
    );
}

/**
 * Crop, don't shrink (PHONE.md), for a scene's pictures on a phone: they
 * are drawn at full size and cut at `height` with a fade, and `label`
 * ("See the bill") lifts the cut. Every picture stays drawn in the HTML;
 * a second picture that folds on its own (`PhoneFold`) is drawn inline
 * here, under the cut. A desk draws them as they are.
 */
export function PhoneClip({
    height,
    label,
    tone = "ink",
    children,
}: {
    height: number;
    label: string;
    tone?: "ink" | "on-ink";
    children: ReactNode;
}) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 [&:has(>details[open])>div]:max-h-none [&:has(>details[open])>div]:[mask-image:none]">
            <div
                style={{ "--clip": `${height}px` } as CSSProperties}
                className="min-w-0 max-[759px]:max-h-[var(--clip)] max-[759px]:overflow-hidden max-[759px]:[mask-image:linear-gradient(to_bottom,#000_calc(100%-64px),transparent)] max-[759px]:[&_[data-pf=desk]]:!contents max-[759px]:[&_[data-pf=phone]]:!hidden"
            >
                {children}
            </div>
            {/* `data-pc`: a scene can show more of itself while this is open. */}
            <details data-pc="toggle" className="group min-[760px]:hidden">
                <summary
                    className={cn(
                        "inline-flex min-h-11 w-fit cursor-pointer list-none items-center rounded-sm font-semibold underline decoration-1 underline-offset-[3px] [&::-webkit-details-marker]:hidden",
                        tone === "ink"
                            ? "text-foreground decoration-border-strong"
                            : "text-mk-lamp-fg decoration-mk-on-ink-line",
                        ring(),
                    )}
                >
                    {label}
                </summary>
            </details>
        </div>
    );
}
