"use client";

import { Check, Copy, Share2 } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";
import type { ButtonProps } from "./button";
import { Button } from "./button";

/** How long "Copied" stays before the label comes back. */
export const COPIED_MS = 1600;

/** The one sentence for a copy that failed. `thing` is "link" by default. */
export function copyFailedMessage(thing = "link") {
    return `Couldn't copy the ${thing}. Select it and copy it instead.`;
}

/**
 * Puts text on the clipboard. The only place in the product that touches
 * `navigator.clipboard`: true when it took, false when the browser refused
 * (no permission, an insecure page, an old browser). Never throws.
 */
export async function copyText(value: string): Promise<boolean> {
    try {
        // Missing on an insecure page and in older browsers, whatever the
        // type says.
        const clipboard =
            typeof navigator === "undefined"
                ? undefined
                : (navigator.clipboard as Clipboard | undefined);
        if (!clipboard) return false;
        await clipboard.writeText(value);
        return true;
    } catch {
        return false;
    }
}

type CopyState = "idle" | "copied" | "failed";

/**
 * Copy with its feedback, for a control that isn't `CopyButton` (a menu
 * row, a whole field that copies on press). `state` is "copied" for 1.6s
 * after a copy that took and then "idle" again; "failed" stays until the
 * next try, so the caller can show the value to select.
 */
export function useCopy() {
    const [state, setState] = React.useState<CopyState>("idle");
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    React.useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    const copy = React.useCallback(async (value: string) => {
        if (timer.current) clearTimeout(timer.current);
        const ok = await copyText(value);
        setState(ok ? "copied" : "failed");
        if (ok) {
            timer.current = setTimeout(() => setState("idle"), COPIED_MS);
        }
        return ok;
    }, []);
    return { state, copy, copied: state === "copied" } as const;
}

type Value = string | (() => string | null | Promise<string | null>);

export interface CopyButtonProps extends Omit<
    ButtonProps,
    "value" | "onClick" | "children" | "asChild"
> {
    /**
     * What to copy. A function for a value that is made on the press (a pay
     * link the API creates): resolve to `null` when it couldn't be made, and
     * say why yourself.
     */
    value: Value;
    label?: string;
    copiedLabel?: string;
    /** What is copied, for the failure sentence: "link", "code", "address". */
    thing?: string;
    /** `false` for words alone. */
    icon?: boolean;
    /** After a copy that took, with the value copied. */
    onCopied?: (value: string) => void;
    /** Classes for the box around the button and its failure text. */
    wrapperClassName?: string;
}

/**
 * The one copy control. Press it and its own label says "Copied" for 1.6
 * seconds, then comes back: the feedback is where the eye already is, so
 * there is no toast (a caller that also MADE the link on this press may
 * toast that, through `onCopied`).
 *
 * When the browser refuses, it says so in one sentence and shows the value
 * selected, ready for the keyboard's own copy.
 */
export function CopyButton({
    value,
    label = "Copy link",
    copiedLabel = "Copied",
    thing = "link",
    icon = true,
    onCopied,
    variant = "outline",
    size = "sm",
    className,
    wrapperClassName,
    disabled,
    ...props
}: CopyButtonProps) {
    const { state, copy } = useCopy();
    const [busy, setBusy] = React.useState(false);
    const [shown, setShown] = React.useState("");
    const field = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (state === "failed") field.current?.select();
    }, [state]);

    const press = async () => {
        setBusy(true);
        try {
            const text = typeof value === "function" ? await value() : value;
            if (text === null) return;
            setShown(text);
            if (await copy(text)) onCopied?.(text);
        } finally {
            setBusy(false);
        }
    };

    const copied = state === "copied";
    const button = (
        <Button
            type="button"
            variant={variant}
            size={size}
            disabled={disabled === true || busy}
            onClick={press}
            data-copy-state={state}
            className={cn("gap-1.5", className)}
            {...props}
        >
            {icon ? (
                copied ? (
                    <Check aria-hidden />
                ) : (
                    <Copy aria-hidden />
                )
            ) : null}
            {/* Polite: the press is acknowledged without interrupting. */}
            <span aria-live="polite">{copied ? copiedLabel : label}</span>
        </Button>
    );

    if (state !== "failed") {
        return wrapperClassName ? (
            <span className={wrapperClassName}>{button}</span>
        ) : (
            button
        );
    }
    return (
        <span
            className={cn(
                "inline-flex max-w-full flex-col gap-1.5",
                wrapperClassName,
            )}
        >
            {button}
            <span
                role="alert"
                className="text-xs text-destructive-subtle-foreground"
            >
                {copyFailedMessage(thing)}
            </span>
            <input
                ref={field}
                readOnly
                value={shown}
                aria-label={`The ${thing}`}
                onFocus={(e) => e.currentTarget.select()}
                className="h-[38px] w-full min-w-0 rounded-md border border-input bg-field px-3 font-mono text-xs coarse:h-11 coarse:text-base"
            />
        </span>
    );
}

export interface ShareLinkProps extends CopyButtonProps {
    /** A line the share sheet sends with the link ("Pay for order 1042"). */
    text?: string;
    /** The share sheet's title, where the phone shows one. */
    title?: string;
    shareLabel?: string;
}

/** What `canShare` reads never changes while the page is open. */
const subscribeNever = () => () => undefined;

/** A thumb, and a browser that can open the phone's share sheet. */
function canShare() {
    return (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches
    );
}

/**
 * "Send it to them", in one press. On a phone it opens the share sheet
 * (WhatsApp, Messages, Mail), with the link and a line to go with it. At a
 * desk, or where the browser can't share, it is `CopyButton`.
 *
 * It decides after it mounts, so the server and the first paint agree (both
 * draw the copy button), and a phone swaps to Share at once.
 */
export function ShareLink({
    text,
    title,
    shareLabel = "Share",
    value,
    onCopied,
    variant = "outline",
    size = "sm",
    className,
    wrapperClassName,
    disabled,
    ...copy
}: ShareLinkProps) {
    // False on the server and for the first paint, then what the device is.
    const share = React.useSyncExternalStore(
        subscribeNever,
        canShare,
        () => false,
    );
    const [fellBack, setFellBack] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    if (!share || fellBack) {
        return (
            <CopyButton
                value={value}
                onCopied={onCopied}
                variant={variant}
                size={size}
                className={className}
                wrapperClassName={wrapperClassName}
                disabled={disabled}
                {...copy}
            />
        );
    }

    const press = async () => {
        setBusy(true);
        try {
            const url = typeof value === "function" ? await value() : value;
            if (url === null) return;
            await navigator.share({ url, text, title });
        } catch (error) {
            // Closing the sheet is a choice, not a failure. Anything else
            // (blocked, unsupported after all) gets the copy button.
            if (!(
                error instanceof DOMException && error.name === "AbortError"
            )) {
                setFellBack(true);
            }
        } finally {
            setBusy(false);
        }
    };

    const button = (
        <Button
            type="button"
            variant={variant}
            size={size}
            disabled={disabled === true || busy}
            onClick={press}
            className={cn("gap-1.5", className)}
        >
            <Share2 aria-hidden />
            {shareLabel}
        </Button>
    );
    return wrapperClassName ? (
        <span className={wrapperClassName}>{button}</span>
    ) : (
        button
    );
}
