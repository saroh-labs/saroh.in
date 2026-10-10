import {
    AlertTriangle,
    Blocks,
    CirclePause,
    Gauge,
    Gem,
    GlobeLock,
    Lock,
    LogIn,
    Search,
    Unplug,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import type { NoResultsCause, ProviderKind } from "../../lib/state-copy";
import {
    clearLabel,
    couldntLoad,
    moduleOff,
    noResultsTitle,
    NOTHING_CHANGED,
    notPublished,
    paused,
    planLabel,
    planLocked,
    providerDisconnected,
    signedOut,
    TRY_AGAIN,
    WHO_CAN_CHANGE_PLAN,
} from "../../lib/state-copy";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Skeleton } from "./skeleton";

/**
 * The named product states (#177, PRODUCT_STRATEGY §30).
 *
 * §30: "These states are part of the product. Do not treat them as edge cases
 * to be designed later." Before this file there was one `EmptyState`, and every
 * reason a screen could have nothing on it rendered identically: a dashed card
 * saying "No orders yet" whether the merchant had made no sales, had Sell
 * switched off, lacked permission, or was looking at a failed query.
 *
 * On a shop floor that difference is the whole message. §5 names Trust as a
 * product goal, and an ambiguous empty state is the most common way a product
 * lies: it reports "nothing to do" when the truth is "we could not find out".
 *
 * So the states are distinguished by three things at once, never by colour
 * alone (§19):
 *
 *   | State         | Component                   | Border | Icon     | Says                          |
 *   | ------------- | --------------------------- | ------ | -------- | ----------------------------- |
 *   | ready         | `EmptyState`                | dashed | caller's | "No X yet" + the action       |
 *   | no results    | `EmptyState` (no-results)   | dashed | Search   | "No X match", the way back    |
 *   | off           | `ModuleOffState`            | dashed | Blocks   | "X is turned off"             |
 *   | plan          | `PlanLockedState`           | dashed | Gem      | "X comes with {Plan}"         |
 *   | limit         | `LimitReachedState`         | dashed | Gauge    | "You're at {n} {things}"      |
 *   | not connected | `ProviderDisconnectedState` | dashed | Unplug   | "No payment provider…"        |
 *   | not published | `NotPublishedNotice`        | dashed | Globe    | "Your website isn't live yet" |
 *   | denied        | `PermissionDeniedState`     | solid  | Lock     | "You can't open X"            |
 *   | paused        | `PausedState`               | solid  | Pause    | "Your access is paused"       |
 *   | signed out    | `SignedOutState`            | solid  | LogIn    | "Your session has ended"      |
 *   | failed        | `FailedState`               | solid  | Alert    | "Couldn't load X", an alert   |
 *   | partial       | `PartialNotice`             | inline | Alert    | what is MISSING, a status     |
 *   | loading       | `LoadingState`              | none   | skeleton | aria-busy                     |
 *
 * Every card comes in three sizes (`page`, `panel`, `inline`) and takes its
 * sentences from `lib/state-copy.ts`, so no screen words its own.
 *
 * A screen reader hears the difference; someone in bright ambient light sees
 * the difference in shape before colour resolves; nobody has to hover to find
 * out (§19 forbids hover-only affordances outright, and the phone and shop
 * floor have no hover at all).
 */

type StateTone = "neutral" | "danger";

/**
 * Where a state is drawn (UX audit, 10 Oct 2026). "Nothing here yet" was
 * drawn seven ways because the one card had one size, so a tab, a panel and
 * a sheet section each made their own:
 *
 * - `page`: the state IS the page's body. Icon, 19px title, one sentence,
 *   the action.
 * - `panel`: a card or a tab inside a page. Smaller, and the icon optional.
 * - `inline`: one line with an optional text action, for a sheet section, a
 *   picker or a row. No box, so it never competes with what is around it.
 */
export type StateSize = "page" | "panel" | "inline";

interface StateCardProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "title"
> {
    size?: StateSize;
    icon?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    /** A single primary action. Never the only way to understand the state. */
    action?: React.ReactNode;
    /**
     * A second, quieter line in its own block: who can change this, when the
     * person reading cannot. Denial is the state that needs it.
     */
    note?: React.ReactNode;
    tone?: StateTone;
    /** Dashed reads as "a space waiting to be filled"; solid as "a wall". */
    outline?: "dashed" | "solid";
}

/** A title is a sentence once it sits in a line of them. */
function asSentence(title: React.ReactNode): React.ReactNode {
    if (typeof title !== "string") return title;
    const text = title.trim();
    return /[.!?][”’"']?$/.test(text) ? text : `${text}.`;
}

/**
 * Shared shell. Padding drops on a phone so the card still fits a 320px
 * viewport without the text column collapsing to two words a line.
 */
function StateCard({
    size = "page",
    icon,
    title,
    description,
    action,
    note,
    tone = "neutral",
    outline = "dashed",
    className,
    ...props
}: StateCardProps) {
    if (size === "inline") {
        // One line: what is true, then the way on. The state's meaning is
        // in the words, since there is no border or shape left to carry it.
        return (
            <div
                data-state-size="inline"
                className={cn(
                    "flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[1.5] text-muted-foreground",
                    className,
                )}
                {...props}
            >
                {icon ? (
                    <span
                        aria-hidden
                        className={cn(
                            "shrink-0 [&_svg]:size-4 [&_svg]:stroke-[1.8]",
                            tone === "danger" ? "text-destructive" : undefined,
                        )}
                    >
                        {icon}
                    </span>
                ) : null}
                <p className="min-w-0 text-pretty">
                    <span
                        className={
                            tone === "danger"
                                ? "font-medium text-foreground"
                                : undefined
                        }
                    >
                        {asSentence(title)}
                    </span>
                    {description ? <> {description}</> : null}
                    {note ? <> {note}</> : null}
                </p>
                {action}
            </div>
        );
    }
    const panel = size === "panel";
    return (
        <div
            data-state-size={size}
            className={cn(
                // The workspace design's state card: 12px, 48/24 of padding
                // and 11px between the parts. A panel is the same card a
                // step smaller, for a tab or a card inside a page.
                "flex flex-col items-center justify-center rounded-[12px] border text-center",
                panel ? "gap-2 px-5 py-7" : "gap-[11px] px-6 py-10 sm:py-12",
                outline === "dashed" ? "border-dashed" : "border-solid",
                tone === "danger" ? "border-destructive/60" : "border-border",
                className,
            )}
            {...props}
        >
            {icon ? (
                <div
                    aria-hidden
                    className={cn(
                        // 30px at stroke 1.8, as the design draws every state
                        // icon (brand file §20). 22px in a panel.
                        "[&_svg]:stroke-[1.8]",
                        panel ? "[&_svg]:size-[22px]" : "[&_svg]:size-[30px]",
                        tone === "danger"
                            ? "text-destructive"
                            : "text-muted-foreground",
                    )}
                >
                    {icon}
                </div>
            ) : null}
            {/* The display face for the line that names the state, and body
                copy a step darker than meta text: this is the sentence
                someone has to read to know what happened. */}
            {panel ? (
                <h3 className="font-display text-[15px] font-semibold tracking-[-0.015em]">
                    {title}
                </h3>
            ) : (
                <h2 className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                    {title}
                </h2>
            )}
            {description ? (
                <p
                    className={cn(
                        "mx-auto max-w-[50ch] text-pretty leading-[1.55] text-neutral-600 dark:text-muted-foreground",
                        panel ? "text-[13px]" : "text-[13.5px]",
                    )}
                >
                    {description}
                </p>
            ) : null}
            {note ? (
                // Who can change it, set apart from why it happened: the
                // design gives this its own sunken block rather than a third
                // paragraph nobody finishes.
                <p className="mx-auto max-w-[50ch] text-pretty rounded-[9px] bg-muted px-[13px] py-[11px] text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                    {note}
                </p>
            ) : null}
            {action ? <div className="mt-0.5">{action}</div> : null}
        </div>
    );
}

/**
 * The one action a state builds for itself (Try again, Clear search, Turn
 * on in Modules): a button on a card, underlined ink text in a line. A link
 * when it has somewhere to go, a button when it does something here.
 */
function StateAction({
    size,
    label,
    href,
    onClick,
    variant = "outline",
    busy = false,
}: {
    size: StateSize;
    label: string;
    href?: string;
    onClick?: () => void;
    variant?: "default" | "outline";
    busy?: boolean;
}) {
    if (size === "inline") {
        const text =
            "wk-press inline-flex items-center rounded-sm font-medium text-foreground underline underline-offset-[3px] hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground coarse:min-h-11";
        return href ? (
            <Link href={href} className={text}>
                {label}
            </Link>
        ) : (
            <button
                type="button"
                onClick={onClick}
                disabled={busy}
                className={text}
            >
                {label}
            </button>
        );
    }
    return href ? (
        <Button asChild variant={variant} className="wk-press">
            <Link href={href}>{label}</Link>
        </Button>
    ) : (
        <Button
            type="button"
            variant={variant}
            className="wk-press"
            onClick={onClick}
            disabled={busy}
        >
            {label}
        </Button>
    );
}

/** A line of text where a link would be, for someone who can't follow it. */
function WhoLine({ size, children }: { size: StateSize; children: string }) {
    return size === "inline" ? (
        <span>{children}</span>
    ) : (
        <p className="text-[13px] leading-[1.5] text-muted-foreground">
            {children}
        </p>
    );
}

/** Two actions side by side on a card, one after the other in a line. */
function Actions({
    size,
    children,
}: {
    size: StateSize;
    children: React.ReactNode;
}) {
    const items = React.Children.toArray(children);
    if (items.length === 0) return null;
    if (items.length === 1) return <>{items[0]}</>;
    return (
        <div
            className={
                size === "inline"
                    ? "flex flex-wrap items-center gap-x-3 gap-y-1"
                    : "flex flex-wrap items-center justify-center gap-2"
            }
        >
            {items}
        </div>
    );
}

type EmptyBase = Omit<StateCardProps, "tone" | "title">;

interface FirstRunProps extends EmptyBase {
    /** Nothing has happened yet. The default. */
    kind?: "first-run";
    /** "No {things} yet", and nothing more: the sentence is `description`. */
    title: React.ReactNode;
}

interface NoResultsProps extends EmptyBase {
    /** The business has some, and a search, filter or tab left none. */
    kind: "no-results";
    /** The thing's own plural word: "invoices". Never "rows". */
    things: string;
    /** What narrowed the list. Decides the title and the way back. */
    cause?: NoResultsCause;
    /** The term searched for, when `cause` is `search`. */
    query?: string | null;
    /** Takes the narrowing off, here. */
    onClear?: () => void;
    /** Or the address that has it off, for a server-rendered list. */
    clearHref?: string;
    title?: React.ReactNode;
}

export type EmptyStateProps = FirstRunProps | NoResultsProps;

/**
 * READY: empty because nothing has happened yet, or because a search, a
 * filter or a tab left nothing.
 *
 * First run (`kind="first-run"`) is the product's first invitation to act:
 * "No {things} yet", ONE plain sentence saying what will show here or what
 * to do, and the action a person with permission would take, labelled as
 * the page header's primary ("New {thing}", no plus icon). Someone who may
 * not create gets no button, and a sentence that does not promise one. This
 * is the ONLY state that may say "No X yet", because it is the only one
 * where that is true.
 *
 * No results (`kind="no-results"`) never reads as "you have none": it names
 * what was searched for and offers the way back, "Clear search", "Clear
 * filters" or "Show all {things}".
 */
export function EmptyState(props: EmptyStateProps) {
    if (props.kind === "no-results") {
        const {
            kind: _kind,
            things,
            cause = "search",
            query,
            onClear,
            clearHref,
            title,
            icon,
            action,
            size = "page",
            outline = "dashed",
            ...rest
        } = props;
        const clear =
            onClear || clearHref ? (
                <StateAction
                    size={size}
                    label={clearLabel(cause, things)}
                    onClick={onClear}
                    href={clearHref}
                />
            ) : null;
        return (
            <StateCard
                data-state="no-results"
                size={size}
                outline={outline}
                tone="neutral"
                icon={icon ?? (size === "page" ? <Search /> : undefined)}
                title={title ?? noResultsTitle(things, cause, query)}
                action={action ?? clear}
                {...rest}
            />
        );
    }
    const { kind: _kind, outline = "dashed", ...rest } = props;
    return (
        <StateCard
            data-state="empty"
            outline={outline}
            tone="neutral"
            {...rest}
        />
    );
}

export interface ModuleOffStateProps extends Omit<
    StateCardProps,
    "tone" | "outline" | "title"
> {
    /** The menu's name for the module: Bookings, Sell, Contacts. */
    name: string;
    /** Whether the person reading may turn it on. */
    canTurnOn: boolean;
    /** Where the switch is. Settings › Modules unless one is closer. */
    href?: string;
    actionLabel?: string;
    title?: React.ReactNode;
    /** The switch itself, when it can be flipped right here. */
    action?: React.ReactNode;
    /** Who can turn it on, for someone who can't. */
    who?: string;
}

/**
 * OFF: empty because a module is switched off (§21).
 *
 * Says which module and how to turn it on, without becoming a dead screen.
 * Turning a module off never deletes what it held (`PRODUCT.md`), and the
 * copy keeps saying so: a merchant who believes otherwise will not turn
 * anything off again. Someone who can't turn it on reads who can, as text,
 * never a button to a switch they can't press.
 */
export function ModuleOffState({
    name,
    canTurnOn,
    href = "/settings/modules",
    actionLabel = moduleOff.action,
    title,
    icon = <Blocks />,
    description,
    action,
    who = moduleOff.who,
    size = "page",
    ...props
}: ModuleOffStateProps) {
    return (
        <StateCard
            data-state="off"
            size={size}
            icon={icon}
            outline="dashed"
            tone="neutral"
            title={title ?? moduleOff.title(name)}
            description={
                description === undefined
                    ? canTurnOn
                        ? moduleOff.body
                        : moduleOff.bodyNoSwitch
                    : description
            }
            action={
                canTurnOn ? (
                    (action ?? (
                        <StateAction
                            size={size}
                            label={actionLabel}
                            href={href}
                            variant="default"
                        />
                    ))
                ) : (
                    <WhoLine size={size}>{who}</WhoLine>
                )
            }
            {...props}
        />
    );
}

export interface PlanLockedStateProps extends Omit<
    StateCardProps,
    "tone" | "outline" | "title" | "action"
> {
    /** What the plan leaves out: "Bookings", "Custom roles". */
    name: string;
    /** The plan that has it, when one does: "Grow". */
    plan?: string | null;
    /** Where the plans are. */
    href: string;
    /** Whether the person reading may change the plan. */
    canChangePlan: boolean;
    title?: React.ReactNode;
    /** A second way on, beside the plan link (a way back). */
    secondary?: React.ReactNode;
}

/**
 * PLAN: the business's plan leaves this out. Locked, not off: it says which
 * plan has it and the way there, and that nothing it holds is gone. The
 * link's label is `planLabel`, the same everywhere a plan is offered, and
 * someone who can't change the plan reads who can, as text.
 */
export function PlanLockedState({
    name,
    plan,
    href,
    canChangePlan,
    title,
    icon = <Gem />,
    description = planLocked.body,
    secondary,
    size = "page",
    ...props
}: PlanLockedStateProps) {
    return (
        <StateCard
            data-state="plan"
            size={size}
            icon={icon}
            outline="dashed"
            tone="neutral"
            title={title ?? planLocked.title(name, plan)}
            description={description}
            action={
                <Actions size={size}>
                    {canChangePlan ? (
                        <StateAction
                            size={size}
                            label={planLabel(plan)}
                            href={href}
                            variant="default"
                        />
                    ) : (
                        <WhoLine size={size}>{WHO_CAN_CHANGE_PLAN}</WhoLine>
                    )}
                    {secondary}
                </Actions>
            }
            {...props}
        />
    );
}

export interface LimitReachedStateProps extends Omit<
    StateCardProps,
    "tone" | "outline" | "action"
> {
    /** The plan with more room, when one has it. */
    plan?: string | null;
    /** Where the plans are. Left out for a limit no plan lifts. */
    href?: string;
    canChangePlan?: boolean;
    /** A second way on, beside the plan link (a way back). */
    secondary?: React.ReactNode;
}

/**
 * LIMIT: the plan has this, and the business has used all of it. The title
 * says where they are ("You're at 20 products"), the sentence what makes
 * room, and the link is `planLabel`. Not a lock: nothing is out of reach,
 * there is no more of it.
 */
export function LimitReachedState({
    plan,
    href,
    canChangePlan = true,
    secondary,
    icon = <Gauge />,
    size = "page",
    ...props
}: LimitReachedStateProps) {
    return (
        <StateCard
            data-state="limit"
            size={size}
            icon={icon}
            outline="dashed"
            tone="neutral"
            action={
                <Actions size={size}>
                    {!href ? null : canChangePlan ? (
                        <StateAction
                            size={size}
                            label={planLabel(plan)}
                            href={href}
                            variant="default"
                        />
                    ) : (
                        <WhoLine size={size}>{WHO_CAN_CHANGE_PLAN}</WhoLine>
                    )}
                    {secondary}
                </Actions>
            }
            {...props}
        />
    );
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
 * DENIED: the surface exists, this person's role does not reach it.
 *
 * §30 asks for permission denial to be explained rather than the surface
 * being hidden entirely. Hiding it makes a business look broken to the
 * person who cannot use it, and makes "ask someone who can" impossible to
 * discover. The one card for a denial, in any size: never the empty card
 * (that is "nothing here yet") and never the failed one (nothing broke).
 *
 * Solid border: this is a wall, not a space waiting to be filled. A paused
 * member and a session that ran out are NOT this: see `PausedState` and
 * `SignedOutState`.
 */
export function PermissionDeniedState({
    icon = <Lock />,
    title = "You can't open this",
    ...props
}: PermissionDeniedStateProps) {
    return (
        <StateCard
            data-state="denied"
            icon={icon}
            title={title}
            outline="solid"
            tone="neutral"
            {...props}
        />
    );
}

export interface PausedStateProps extends Omit<
    StateCardProps,
    "tone" | "outline" | "title"
> {
    /** The business the person is paused in. */
    business?: string | null;
    title?: React.ReactNode;
}

/**
 * PAUSED: the person belongs here, and the plan's team limit has set them
 * aside for now. Not a denial: no role was changed, and the way back is the
 * plan, not Team. Drawn as "no access" it sent people to ask for a role
 * they already had.
 */
export function PausedState({
    business,
    title,
    icon = <CirclePause />,
    description = paused.body,
    note = paused.who,
    ...props
}: PausedStateProps) {
    return (
        <StateCard
            data-state="paused"
            icon={icon}
            title={title ?? paused.title(business)}
            description={description}
            note={note}
            outline="solid"
            tone="neutral"
            {...props}
        />
    );
}

export interface SignedOutStateProps extends Omit<
    StateCardProps,
    "tone" | "outline" | "title" | "action"
> {
    /** Where signing in happens, with the way back here in it. */
    signInHref: string;
    title?: React.ReactNode;
}

/**
 * SIGNED OUT: the session ran out. Nothing about roles, since no owner or
 * admin can lift it. One action: Sign in.
 */
export function SignedOutState({
    signInHref,
    title = signedOut.title,
    description = signedOut.body,
    icon = <LogIn />,
    size = "page",
    ...props
}: SignedOutStateProps) {
    return (
        <StateCard
            data-state="signed-out"
            size={size}
            icon={icon}
            title={title}
            description={description}
            outline="solid"
            tone="neutral"
            action={
                <StateAction
                    size={size}
                    label={signedOut.action}
                    href={signInHref}
                    variant="default"
                />
            }
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
     * failed says so with `couldntLoad("orders")`: "Couldn't load orders"
     * beats "Couldn't load this" on a screen showing three panels.
     */
    title?: React.ReactNode;
    /**
     * Reads again. It must actually fetch: a boundary's `retry`, a hook's
     * refetch, `router.refresh()`. Never a redraw of the same failed read.
     */
    onRetry?: () => void;
    /** Or the address that reads again, for a server-rendered state. */
    retryHref?: string;
    /** While the retry is on its way: the button waits. */
    retrying?: boolean;
    /** A second way on, beside Try again (a way back). */
    action?: React.ReactNode;
    /** The digest support can look a failure up by. */
    reference?: string | null;
}

/**
 * FAILED: we could not find out.
 *
 * Never renders as "nothing here". It carries `role="alert"`, a solid
 * destructive border and an alert icon, so it is distinguishable from an
 * empty list by shape and by semantics, not only by colour (§19).
 *
 * The distinction this exists for: a screen that is silently empty because a
 * query failed is indistinguishable from one that is empty because there is
 * nothing to do, and the merchant acts on that difference. So it offers
 * "Try again" (`onRetry` or `retryHref`), never "reload the page".
 */
export function FailedState({
    icon = <AlertTriangle />,
    title = couldntLoad(),
    description = NOTHING_CHANGED,
    onRetry,
    retryHref,
    retrying = false,
    action,
    reference,
    size = "page",
    ...props
}: FailedStateProps) {
    const retry =
        onRetry || retryHref ? (
            <StateAction
                size={size}
                label={TRY_AGAIN}
                onClick={onRetry}
                href={retryHref}
                variant={size === "page" ? "default" : "outline"}
                busy={retrying}
            />
        ) : null;
    const showReference = Boolean(reference) && size !== "inline";
    return (
        <StateCard
            role="alert"
            data-state="failed"
            size={size}
            icon={icon}
            title={title}
            description={description}
            outline="solid"
            tone="danger"
            action={
                retry || action || showReference ? (
                    <div
                        className={
                            size === "inline"
                                ? "contents"
                                : "flex flex-col items-center gap-3"
                        }
                    >
                        <Actions size={size}>
                            {retry}
                            {action}
                        </Actions>
                        {showReference ? (
                            <p className="font-mono text-xs text-muted-foreground">
                                Reference: {reference}
                            </p>
                        ) : null}
                    </div>
                ) : null
            }
            {...props}
        />
    );
}

export interface ProviderDisconnectedStateProps extends Omit<
    StateCardProps,
    "tone" | "outline" | "title" | "action"
> {
    /** Which provider is missing. */
    provider: ProviderKind;
    /** Whether the person reading may connect one. */
    canConnect?: boolean;
    /**
     * Where it is connected. Settings › Providers unless one is closer, and
     * `null` on the Providers screen itself, where the list below is the way.
     */
    href?: string | null;
    title?: React.ReactNode;
}

/**
 * NOT CONNECTED: payments or email has no provider, so the thing on this
 * screen can't happen yet. One wording and one action wherever it is met
 * (a page, a pay-way row, the composer, a share sheet): what is missing,
 * what that stops, and "Connect in Providers". Not a failure, and not off.
 */
export function ProviderDisconnectedState({
    provider,
    canConnect = true,
    href = providerDisconnected.href,
    title,
    description,
    icon = <Unplug />,
    size = "panel",
    ...props
}: ProviderDisconnectedStateProps) {
    const inline = size === "inline";
    return (
        <StateCard
            data-state="not-connected"
            size={size}
            icon={inline ? undefined : icon}
            outline="dashed"
            tone="neutral"
            title={
                title ??
                (inline
                    ? providerDisconnected.line(provider)
                    : providerDisconnected.title(provider))
            }
            description={
                description === undefined && !inline
                    ? providerDisconnected.body(provider)
                    : description
            }
            action={
                href === null ? undefined : canConnect ? (
                    <StateAction
                        size={size}
                        label={providerDisconnected.action}
                        href={href}
                    />
                ) : (
                    <WhoLine size={size}>{providerDisconnected.who}</WhoLine>
                )
            }
            {...props}
        />
    );
}

export interface NotPublishedNoticeProps extends Omit<
    StateCardProps,
    "tone" | "outline" | "title" | "action"
> {
    /** Whether the person reading may publish. */
    canPublish?: boolean;
    /** Where it is published from: the site's own screen when known. */
    href?: string;
    title?: React.ReactNode;
}

/**
 * NOT PUBLISHED: the website isn't live, so a link, a QR code or a share
 * card that points at it leads nowhere yet. One wording and one action,
 * "Go to Website", wherever it is met.
 */
export function NotPublishedNotice({
    canPublish = true,
    href = notPublished.href,
    title,
    description,
    icon = <GlobeLock />,
    size = "inline",
    ...props
}: NotPublishedNoticeProps) {
    const inline = size === "inline";
    return (
        <StateCard
            data-state="not-published"
            size={size}
            icon={inline ? undefined : icon}
            outline="dashed"
            tone="neutral"
            title={title ?? (inline ? notPublished.line : notPublished.title)}
            description={
                description === undefined && !inline
                    ? notPublished.body
                    : description
            }
            action={
                canPublish ? (
                    <StateAction
                        size={size}
                        label={notPublished.action}
                        href={href}
                    />
                ) : (
                    <WhoLine size={size}>{notPublished.who}</WhoLine>
                )
            }
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
                // Saffron, not Warning: a partial read is something UNKNOWN,
                // not something wrong. Warning's red-orange would read as a
                // fault (the workspace design's partial banner).
                "flex flex-col gap-2 rounded-[10px] border border-brand/50 bg-brand-subtle px-3.5 py-3 text-[13px] leading-[1.5] text-brand-subtle-foreground sm:flex-row sm:items-center sm:justify-between",
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
    /**
     * `list` draws the workspace design's shape: a bordered card of rows, each
     * an avatar and two bars, so the skeleton is the size and rhythm of the
     * list that replaces it. `plain` is a bare stack for callers that size
     * their own blocks.
     */
    variant?: "plain" | "list";
}

/**
 * LOADING — on its way.
 *
 * `aria-busy` and a label, so a screen reader is told this is arriving rather
 * than being read a wall of empty boxes. The sweep animation (not a pulse)
 * reads as "arriving" where a synchronised pulse reads as "broken".
 *
 * Only the first bar of a row sweeps. Every block moving at once is a light
 * show; one moving line is a thing loading (the workspace design's skeleton).
 */
export function LoadingState({
    rows = 3,
    label = "Loading",
    variant = "plain",
    className,
    ...props
}: LoadingStateProps) {
    return (
        <div
            aria-busy="true"
            aria-live="polite"
            className={cn(
                variant === "list"
                    ? "rounded-[12px] border border-border px-4 py-2"
                    : "flex flex-col gap-2",
                className,
            )}
            {...props}
        >
            <span className="sr-only">{label}</span>
            {Array.from({ length: rows }, (_, index) =>
                variant === "list" ? (
                    <div
                        key={index}
                        aria-hidden
                        className="flex items-center gap-3 border-b border-foreground/10 py-3 last:border-b-0"
                    >
                        <Skeleton className="size-[30px] shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1">
                            <Skeleton className="h-[11px] w-[30%] rounded-[4px]" />
                            {/* Still, and a shade paler: a second line that
                                also swept would read as two things loading. */}
                            <div className="mt-[7px] h-[7px] w-[19%] rounded-[4px] bg-muted/70" />
                        </div>
                    </div>
                ) : (
                    <Skeleton key={index} className="h-12 w-full" />
                ),
            )}
        </div>
    );
}
