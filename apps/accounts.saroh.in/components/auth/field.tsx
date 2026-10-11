"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import * as React from "react";

/**
 * The parts an account page is made of, at the design's measurements.
 *
 * These five pages are hand-rolled against `authClient` rather than built on
 * the form primitives (`docs/patterns/frontend-forms.md` holds them there
 * until every accounts form migrates at once), so without this file each page
 * re-types its own label size and its own field spacing — which is how five
 * pages become five dialects of the same screen.
 *
 * Where the design and the shared tokens disagree they disagree by a pixel:
 * the mock draws a 9px field radius and a 40px call to action against the
 * token layer's 8px and 38px. The mock wins HERE because these screens are
 * the redesign's reference; reconciling the two belongs in the token layer,
 * not in a per-page override.
 */

/*
 * The field is the shared `Input` (UX audit, 10 Oct), so its height, border,
 * fill, focus ring, disabled and invalid looks are the token layer's and a
 * change there reaches these pages. That also gives it the touch size: 44px
 * on a coarse pointer, where this file's own 38px field had none.
 *
 * What stays local is small. The design's 9px radius and 11px inset. 16px
 * type on a touch screen, because iOS Safari zooms the page when a smaller
 * field takes focus and leaves it zoomed. And the read-only look, for an
 * invitation's fixed address.
 */
const FIELD =
    "rounded-[9px] px-[11px] text-[13.5px] text-foreground coarse:text-base read-only:bg-muted read-only:text-muted-foreground";

export interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    /**
     * A quiet line under the field — a rule, not an error.
     *
     * ## Note or placeholder?
     *
     * A PLACEHOLDER is an example of the format — `you@example.com` — and may
     * safely vanish, because once someone is typing they no longer need to be
     * shown the shape of the thing they are typing.
     *
     * A NOTE is a rule or a consequence, and has to survive typing. "At least
     * 8 characters" as a placeholder is the classic version of this mistake:
     * it disappears the moment the person starts trying to satisfy it, and
     * returns only as a validation error once they have got it wrong.
     *
     * Which is why this is not on every field. A note under each one is
     * wallpaper, and wallpaper is not read — so the fields that genuinely
     * carry a rule lose the only thing that would have made them stand out.
     */
    note?: string;
    /** The link that sits opposite the label, e.g. "Forgot it?" on a password. */
    side?: { href: string; label: string };
}

/**
 * A labelled field. The label's TEXT is the accessible name the end-to-end
 * suite types against (`Email`, `Password`), so it is the one thing here that
 * is not free to change with the design.
 */
export const AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(
    ({ label, note, side, id, className, ...props }, ref) => {
        const fieldId = id ?? props.name;
        return (
            <div className="sa-rise mb-3.5">
                <div className="mb-1.5 flex items-baseline gap-3">
                    <label
                        htmlFor={fieldId}
                        className="text-[12.5px] font-medium"
                    >
                        {label}
                    </label>
                    {side ? (
                        <Link
                            href={side.href}
                            className="text-muted-foreground hover:text-foreground ml-auto text-[12px] underline-offset-4 transition-colors hover:underline"
                        >
                            {side.label}
                        </Link>
                    ) : null}
                </div>
                <Input
                    ref={ref}
                    id={fieldId}
                    className={cn("sa-input", FIELD, className)}
                    {...props}
                />
                {note ? (
                    <p className="text-muted-foreground mt-[5px] text-pretty text-[11.5px] leading-[1.45]">
                        {note}
                    </p>
                ) : null}
            </div>
        );
    },
);
AuthField.displayName = "AuthField";

/** The page's one primary action: full width, 40px, Ink. */
export function AuthSubmit({
    children,
    className,
    ...props
}: React.ComponentProps<typeof Button>) {
    return (
        <Button
            type="submit"
            className={cn(
                "sa-cta sa-rise coarse:h-11 mt-1 h-10 w-full rounded-[9px] text-[13.5px] font-semibold",
                className,
            )}
            {...props}
        >
            {children}
        </Button>
    );
}

/**
 * "or", with a rule either side. A divider rather than a second stacked
 * button, because it says these are two routes to the same place rather than
 * two things to do.
 */
export function AuthDivider() {
    return (
        <div className="sa-rise mb-3.5 mt-4 flex items-center gap-3">
            <span className="bg-border/70 h-px flex-1" />
            <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
                or
            </span>
            <span className="bg-border/70 h-px flex-1" />
        </div>
    );
}

/** What went wrong, announced. Never motion — the words are the feedback. */
export function AuthError({ children }: { children: React.ReactNode }) {
    return (
        <p
            role="alert"
            className="sa-alert border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground mb-3.5 rounded-[9px] border px-3 py-2 text-[12.5px]"
        >
            {children}
        </p>
    );
}

/** The heading and its one line, at the top of every account page. */
export function AuthHeading({
    title,
    promise,
    blurb,
}: {
    title: string;
    /**
     * What Saroh does, in one line, for a phone. The panel says it at desk
     * width and is gone below 760px, so this line shows only there.
     */
    promise?: string;
    blurb?: React.ReactNode;
}) {
    return (
        <>
            <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                {title}
            </h1>
            {promise ? (
                <p className="sa-rise text-foreground mt-[7px] text-pretty text-[13.5px] font-medium leading-[1.5] min-[760px]:hidden">
                    {promise}
                </p>
            ) : null}
            {blurb ? (
                <p className="sa-rise dark:text-muted-foreground mb-[22px] mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600">
                    {blurb}
                </p>
            ) : null}
        </>
    );
}

/**
 * A second way to do what the page does, as a quiet button under the main
 * one: "Use a password instead", "Resend code", "Change email". Text with an
 * underline rather than a second filled button, so the page keeps one
 * primary. 44px tall on a touch screen.
 */
export function AuthAlt({
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            className={cn(
                "sa-press text-foreground decoration-border-strong hover:decoration-foreground active:text-muted-foreground focus-visible:ring-ring focus-visible:ring-offset-background disabled:text-muted-foreground coarse:h-11 mt-2 block h-9 w-full rounded-[9px] text-[12.5px] font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default disabled:no-underline",
                className,
            )}
            {...props}
        />
    );
}

/** The line under the form that points at the other page. */
export function AuthFooter({ children }: { children: React.ReactNode }) {
    return (
        <p className="sa-rise text-muted-foreground mt-5 text-[12.5px]">
            {children}
        </p>
    );
}

/**
 * A plain fact set apart from the form: a titled note on the quiet surface,
 * as the design draws the states that have nothing to type (an expired link,
 * a page opened without one).
 */
export function AuthNote({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="sa-rise bg-muted mb-4 rounded-[10px] px-3.5 py-3">
            <p className="text-[12.5px] font-semibold">{title}</p>
            <p className="text-muted-foreground mt-1 text-pretty text-[12.5px] leading-[1.55]">
                {children}
            </p>
        </div>
    );
}
