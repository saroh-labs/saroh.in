import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";

export type NoticeTone = "info" | "warning" | "error" | "success" | "neutral";

/*
 * The `-subtle` pairs, never an alpha tint: `bg-warning/10` over a muted
 * panel is a different colour than over the page, and its text falls under
 * 4.5:1 on one of them. A subtle pair is one decided colour with its own
 * text colour, light and dark.
 */
const TONE: Record<NoticeTone, string> = {
    info: "border-transparent bg-info-subtle text-info-subtle-foreground",
    warning:
        "border-transparent bg-warning-subtle text-warning-subtle-foreground",
    error: "border-transparent bg-destructive-subtle text-destructive-subtle-foreground",
    success:
        "border-transparent bg-success-subtle text-success-subtle-foreground",
    neutral: "border-border bg-muted text-foreground",
};

/** One glyph per meaning. The warning glyph is the triangle, everywhere. */
const ICON: Record<NoticeTone, React.ComponentType<{ className?: string }>> = {
    info: Info,
    warning: TriangleAlert,
    error: CircleAlert,
    success: CircleCheck,
    neutral: Info,
};

/**
 * What a screen reader does with it. An error interrupts; the rest wait
 * their turn; a neutral note is read in place.
 */
const ROLE: Record<NoticeTone, "alert" | "status" | "note"> = {
    info: "status",
    warning: "status",
    error: "alert",
    success: "status",
    neutral: "note",
};

export interface NoticeProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "title" | "role"
> {
    tone?: NoticeTone;
    /** A bold first line. Leave out for a one-sentence notice. */
    title?: React.ReactNode;
    /** A button or link, on the right at the desk and under the text on a phone. */
    action?: React.ReactNode;
    /**
     * Overrides the tone's role. `"none"` for a notice that is already
     * inside something announced (a field's error text, a dialog's body).
     */
    role?: "alert" | "status" | "note" | "none";
    /**
     * `card` sits in the page's flow with corners. `banner` runs edge to
     * edge under a header, ruled off below.
     */
    layout?: "card" | "banner";
    /** `false` for no glyph, or a glyph of the caller's own. */
    icon?: React.ReactNode | false;
}

/**
 * The one way to say something beside the content: a problem, a warning, a
 * fact worth knowing, a success that should stay on screen. The tone is said
 * three ways (glyph, tint and the words themselves), never by colour alone.
 *
 * Not for the outcome of a press (that is a toast), not for a field's
 * mistake (the field says it), and not for a whole screen with nothing on
 * it (those are the state cards in `data-state`).
 */
export const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(
    function Notice(
        {
            tone = "neutral",
            title,
            action,
            role,
            layout = "card",
            icon,
            className,
            children,
            ...props
        },
        ref,
    ) {
        const Glyph = ICON[tone];
        const as = role ?? ROLE[tone];
        return (
            <div
                ref={ref}
                role={as === "none" ? undefined : as}
                data-notice={tone}
                className={cn(
                    "flex flex-col gap-2.5 text-sm leading-[1.5] sm:flex-row sm:items-start sm:justify-between sm:gap-4",
                    layout === "card"
                        ? "rounded-lg border px-3.5 py-3"
                        : "border-b px-4 py-2.5 sm:px-[22px]",
                    TONE[tone],
                    className,
                )}
                {...props}
            >
                <div className="flex min-w-0 items-start gap-2.5">
                    {icon === false ? null : (
                        <span
                            aria-hidden
                            className="mt-0.5 shrink-0 [&_svg]:size-4"
                        >
                            {icon ?? <Glyph />}
                        </span>
                    )}
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                        {title ? (
                            <p className="font-semibold">{title}</p>
                        ) : null}
                        {children}
                    </div>
                </div>
                {action ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[26px] sm:pl-0">
                        {action}
                    </div>
                ) : null}
            </div>
        );
    },
);
