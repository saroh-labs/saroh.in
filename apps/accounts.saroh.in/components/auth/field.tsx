"use client";

import { Button } from "@saroh/ui/button";
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

const FIELD =
    "h-[38px] w-full rounded-[9px] border border-input bg-field px-[11px] text-[13.5px] text-foreground ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-disabled-foreground aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive-subtle";

export interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    /** A quiet line under the field — a rule, not an error. */
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
                <input
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
                "sa-cta sa-rise mt-1 h-10 w-full rounded-[9px] text-[13.5px] font-semibold",
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
    blurb,
}: {
    title: string;
    blurb?: React.ReactNode;
}) {
    return (
        <>
            <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                {title}
            </h1>
            {blurb ? (
                <p className="sa-rise dark:text-muted-foreground mb-[22px] mt-[7px] text-pretty text-[13px] leading-[1.55] text-neutral-600">
                    {blurb}
                </p>
            ) : null}
        </>
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
