import { AlertTriangle, Blocks, Lock } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";
import { Skeleton } from "./skeleton";

/**
 * The named product states (#177, PRODUCT_STRATEGY §30).
 *
 * §30: "These states are part of the product. Do not treat them as edge cases
 * to be designed later." Before this file there was one `EmptyState`, and every
 * reason a screen could have nothing on it rendered identically — a dashed card
 * saying "No orders yet" whether the merchant had made no sales, had Commerce
 * switched off, lacked permission, or was looking at a failed query.
 *
 * On a shop floor that difference is the whole message. §5 names Trust as a
 * product goal, and an ambiguous empty state is the most common way a product
 * lies: it reports "nothing to do" when the truth is "we could not find out".
 *
 * So the states are distinguished by three things at once, never by colour
 * alone (§19):
 *
 *   | State     | Border | Icon      | Wording                    | Semantics    |
 *   | --------- | ------ | --------- | -------------------------- | ------------ |
 *   | ready     | dashed | caller's  | "No X yet" + next step     | —            |
 *   | off       | dashed | Blocks    | "X is turned off"          | —            |
 *   | denied    | solid  | Lock      | "You do not have access"   | —            |
 *   | failed    | solid  | Alert     | "could not be loaded"      | role="alert" |
 *   | partial   | inline | Alert     | what is MISSING            | role="status"|
 *   | loading   | none   | skeleton  | —                          | aria-busy    |
 *
 * A screen reader hears the difference; someone in bright ambient light sees
 * the difference in shape before colour resolves; nobody has to hover to find
 * out (§19 forbids hover-only affordances outright, and the phone and shop
 * floor have no hover at all).
 */

type StateTone = "neutral" | "danger";

interface StateCardProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "title"
> {
    icon?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    /** A single primary action. Never the only way to understand the state. */
    action?: React.ReactNode;
    tone?: StateTone;
    /** Dashed reads as "a space waiting to be filled"; solid as "a wall". */
    outline?: "dashed" | "solid";
}

/**
 * Shared shell. Padding is `p-8` rather than `p-12` so the card still fits a
 * 320px viewport without the text column collapsing to two words a line.
 */
function StateCard({
    icon,
    title,
    description,
    action,
    tone = "neutral",
    outline = "dashed",
    className,
    ...props
}: StateCardProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-lg border p-8 text-center sm:p-12",
                outline === "dashed" ? "border-dashed" : "border-solid",
                tone === "danger" && "border-destructive/60",
                className,
            )}
            {...props}
        >
            {icon ? (
                <div
                    className={cn(
                        "[&_svg]:h-8 [&_svg]:w-8",
                        tone === "danger"
                            ? "text-destructive"
                            : "text-muted-foreground",
                    )}
                >
                    {icon}
                </div>
            ) : null}
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">{title}</h2>
                {description ? (
                    <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {action}
        </div>
    );
}

export type EmptyStateProps = Omit<StateCardProps, "tone">;

/**
 * READY — empty because nothing has happened yet.
 *
 * A first-run surface (§5): it reads as ready, and offers the action that would
 * fill it. This is the ONLY state that may say "No X yet", because it is the
 * only one where that is true.
 */
export function EmptyState({ outline = "dashed", ...props }: EmptyStateProps) {
    return <StateCard outline={outline} tone="neutral" {...props} />;
}

export interface CapabilityOffStateProps extends Omit<
    StateCardProps,
    "tone" | "outline" | "icon"
> {
    icon?: React.ReactNode;
}

/**
 * OFF — empty because a capability is switched off (§21).
 *
 * Says which capability and how to turn it on, without becoming a dead screen.
 * Turning a capability off never deletes what it held (`PRODUCT.md`), and the
 * copy must keep saying so — a merchant who believes otherwise will not turn
 * anything off again.
 */
export function CapabilityOffState({
    icon = <Blocks />,
    ...props
}: CapabilityOffStateProps) {
    return <StateCard icon={icon} outline="dashed" tone="neutral" {...props} />;
}

export interface PermissionDeniedStateProps extends Omit<
    StateCardProps,
    "tone" | "outline" | "icon" | "title"
> {
    icon?: React.ReactNode;
    /** Optional: this state carries a sensible default. */
    title?: React.ReactNode;
}

/**
 * DENIED — the surface exists, this person may not see it.
 *
 * §30 asks for permission denial to be explained rather than the surface being
 * hidden entirely. Hiding it makes a workspace look broken to the person who
 * cannot use it, and makes "ask someone who can" impossible to discover.
 *
 * Solid border: this is a wall, not a space waiting to be filled.
 */
export function PermissionDeniedState({
    icon = <Lock />,
    title = "You do not have access to this",
    ...props
}: PermissionDeniedStateProps) {
    return (
        <StateCard
            icon={icon}
            title={title}
            outline="solid"
            tone="neutral"
            {...props}
        />
    );
}

export interface FailedStateProps extends Omit<
    StateCardProps,
    "tone" | "outline" | "icon" | "title"
> {
    icon?: React.ReactNode;
    /**
     * Optional: a failure has a usable default. A caller that knows WHAT
     * failed should still say so — "Orders could not be loaded" beats "This
     * could not be loaded" on a screen showing three panels.
     */
    title?: React.ReactNode;
    /** A retry control. §30 requires retry to be offered, not just described. */
    action?: React.ReactNode;
}

/**
 * FAILED — we could not find out.
 *
 * Never renders as "nothing here". It carries `role="alert"`, a solid
 * destructive border and an alert icon, so it is distinguishable from an empty
 * list by shape and by semantics, not only by colour (§19).
 *
 * The distinction this exists for: a screen that is silently empty because a
 * query failed is indistinguishable from one that is empty because there is
 * nothing to do — and the merchant acts on that difference.
 */
export function FailedState({
    icon = <AlertTriangle />,
    title = "This could not be loaded",
    description = "Something went wrong on our side, so this may not be the whole picture. Nothing has been changed.",
    ...props
}: FailedStateProps) {
    return (
        <StateCard
            role="alert"
            icon={icon}
            title={title}
            description={description}
            outline="solid"
            tone="danger"
            {...props}
        />
    );
}

export interface PartialNoticeProps extends React.HTMLAttributes<HTMLDivElement> {
    /** What is MISSING — not what is shown. */
    children: React.ReactNode;
    action?: React.ReactNode;
}

/**
 * PARTIAL — some of this is shown, some could not be reached.
 *
 * A banner ABOVE the data rather than a card instead of it, because the data
 * that did arrive is still worth having. §30: say what is missing rather than
 * presenting a subset as whole.
 *
 * Uses the `warning-subtle` pair, which exists precisely so a warning can be
 * text on a pale tint — `--warning` is a fill and cannot double as text (see
 * globals.css).
 */
export function PartialNotice({
    children,
    action,
    className,
    ...props
}: PartialNoticeProps) {
    return (
        <div
            role="status"
            className={cn(
                "flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-subtle p-3 text-sm text-warning-subtle-foreground sm:flex-row sm:items-center sm:justify-between",
                className,
            )}
            {...props}
        >
            <span className="flex items-start gap-2">
                <AlertTriangle
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>{children}</span>
            </span>
            {action}
        </div>
    );
}

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
    /** How many placeholder rows to draw. */
    rows?: number;
    /** Announced to assistive tech while the rows are meaningless. */
    label?: string;
}

/**
 * LOADING — on its way.
 *
 * `aria-busy` and a label, so a screen reader is told this is arriving rather
 * than being read a wall of empty boxes. The sweep animation (not a pulse)
 * reads as "arriving" where a synchronised pulse reads as "broken".
 */
export function LoadingState({
    rows = 3,
    label = "Loading",
    className,
    ...props
}: LoadingStateProps) {
    return (
        <div
            aria-busy="true"
            aria-live="polite"
            className={cn("flex flex-col gap-2", className)}
            {...props}
        >
            <span className="sr-only">{label}</span>
            {Array.from({ length: rows }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
            ))}
        </div>
    );
}
