"use client";

import { submitOnModEnter } from "@/lib/hooks/keyboard-save";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import type { FormEvent, ReactNode, RefObject } from "react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import { draftWatch, useDraftChanged } from "./use-draft-changed";

/**
 * What `FormSheet` and `FormDialog` share, so a side sheet and a dialog
 * close, save and hand the keyboard back by one rule (UX audit, 10 Oct):
 *
 * - Nothing is saved until the overlay's own button.
 * - A press outside closes it only while nothing has changed. Once the
 *   draft differs from what it opened with, a press outside does nothing:
 *   a stray tap is a slip. Cancel, Escape and the close button are
 *   decisions, and drop the draft unasked.
 * - While a save is on its way nothing closes it and both buttons wait.
 * - The button is never off for "nothing changed": an edit that says
 *   its draft is unchanged (`dirty={false}`) just closes, with no write.
 *   What is wrong is said when the button is pressed, and the keyboard
 *   goes to the first field that needs fixing.
 * - Open, the keyboard starts in the first field. Closed, it goes back to
 *   what opened it.
 */

export type OverlaySubmit = (
    event: FormEvent<HTMLFormElement>,
) => void | Promise<void>;

interface OverlayContextValue {
    pending: boolean;
    close: () => void;
    setDirty: (dirty: boolean) => void;
    /** A draft under the frame says its save is on its way. */
    setPending: (pending: boolean) => void;
    /** The foot's own handler, for a draft that lives under the frame. */
    register: (submit: OverlaySubmit | null) => void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

function useOverlay(): OverlayContextValue {
    const value = useContext(OverlayContext);
    if (!value) {
        throw new Error("Drawn outside a FormSheet or FormDialog.");
    }
    return value;
}

/** The fields a keyboard can start in, in the order they are drawn. */
const FIRST_FIELD =
    'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role="combobox"]:not([disabled]), [contenteditable="true"]';

/** Anything the keyboard can land on, for a body that starts with a switch. */
const CONTROLS =
    'input, textarea, select, button, a[href], [role="combobox"], [contenteditable="true"]';

/** The first control in the fields the keyboard can start in. */
function firstControl(body: Element | null | undefined): HTMLElement | null {
    for (const el of Array.from(
        body?.querySelectorAll<HTMLElement>(CONTROLS) ?? [],
    )) {
        if (
            el.matches(":disabled") ||
            el.getAttribute("type") === "hidden" ||
            el.getAttribute("tabindex") === "-1" ||
            el.getAttribute("aria-hidden") === "true"
        ) {
            continue;
        }
        return el;
    }
    return null;
}

const INVALID = '[aria-invalid="true"]:not([disabled])';

/** A field that asks for the keyboard on opening, ahead of the first. */
const AUTOFOCUS = "[data-autofocus]:not([disabled]):not([readonly])";

/**
 * The last control pressed. A press doesn't focus a button everywhere
 * (Safari), so "what had the keyboard" alone would lose the opener there.
 */
let lastPressed: HTMLElement | null = null;
let watching = false;
function watchPresses() {
    if (watching || typeof document === "undefined") return;
    watching = true;
    document.addEventListener(
        "click",
        (event) => {
            const at = event.target;
            if (!(at instanceof Element)) return;
            // Presses inside an overlay open nothing behind it.
            if (at.closest('[role="dialog"], [role="alertdialog"]')) return;
            lastPressed = at.closest<HTMLElement>(
                'button, a[href], [role="button"], [role="menuitem"]',
            );
        },
        true,
    );
}

export interface OverlayFrameOptions {
    open: boolean;
    pending: boolean;
    /** Leave it out and the frame reads the fields. */
    dirty?: boolean;
    /** The overlay has a `trigger`: Radix hands the keyboard back itself. */
    hasTrigger: boolean;
    returnFocusTo?: string | (() => HTMLElement | null | undefined);
    /**
     * An edit ("Save") that says nothing changed closes without a write.
     * False for a create or an action, whose button always runs.
     */
    closesUnchanged: boolean;
    onOpen?: () => void;
    onClose: () => void;
    onSubmit?: OverlaySubmit;
}

/** The one set of closing, saving and focus rules, for either frame. */
export function useOverlayFrame({
    open,
    pending: framePending,
    dirty,
    hasTrigger,
    returnFocusTo,
    closesUnchanged,
    onOpen,
    onClose,
    onSubmit,
}: OverlayFrameOptions) {
    const { attach, touch, changed } = useDraftChanged();
    const form = useRef<HTMLFormElement | null>(null);
    const opener = useRef<HTMLElement | null>(null);
    const registered = useRef<OverlaySubmit | null>(null);
    // Said by a draft under the frame (`useOverlayDraft`).
    const [said, setSaid] = useState<boolean | null>(null);
    // And by its foot, where the draft holds the save (`OverlayFoot`).
    const [footPending, setFootPending] = useState(false);
    const pending = framePending || footPending;

    // What had the keyboard when it opened, before the overlay takes it,
    // or failing that what was last pressed.
    useEffect(watchPresses, []);
    useLayoutEffect(() => {
        if (!open) return;
        const active = document.activeElement;
        opener.current =
            active instanceof HTMLElement && active !== document.body
                ? active
                : lastPressed;
    }, [open]);

    const isDirty = useCallback(
        () => dirty ?? said ?? changed(),
        [dirty, said, changed],
    );

    const setForm = useCallback(
        (el: HTMLFormElement | null) => {
            form.current = el;
            attach(el);
        },
        [attach],
    );

    const register = useCallback((submit: OverlaySubmit | null) => {
        registered.current = submit;
    }, []);
    const setDirty = useCallback((next: boolean) => setSaid(next), []);

    const context: OverlayContextValue = {
        pending,
        close: onClose,
        setDirty,
        setPending: setFootPending,
        register,
    };

    return {
        context,
        onOpenChange: (next: boolean) => {
            if (pending) return;
            if (next) onOpen?.();
            else onClose();
        },
        contentProps: {
            onInteractOutside: (event: Event) => {
                // A stray tap must not throw typed work away.
                if (pending || isDirty()) event.preventDefault();
            },
            onEscapeKeyDown: (event: Event) => {
                if (pending) event.preventDefault();
            },
            onOpenAutoFocus: (event: Event) => {
                const body = form.current?.querySelector("[data-overlay-body]");
                // A field marked for it takes the keyboard first, its value
                // selected (the stock sheet's first count, not a name).
                const marked = body?.querySelector<HTMLElement>(AUTOFOCUS);
                const first =
                    marked ??
                    firstControl(body) ??
                    form.current?.querySelector<HTMLElement>(FIRST_FIELD);
                if (!first) return;
                event.preventDefault();
                first.focus();
                if (marked instanceof HTMLInputElement) marked.select();
            },
            ...(hasTrigger
                ? {}
                : {
                      onCloseAutoFocus: (event: Event) => {
                          event.preventDefault();
                          // One overlay's save can open the next: the
                          // keyboard stays in that one.
                          if (
                              document.querySelector(
                                  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
                              )
                          ) {
                              return;
                          }
                          const named =
                              typeof returnFocusTo === "string"
                                  ? document.getElementById(returnFocusTo)
                                  : returnFocusTo?.();
                          const back =
                              named ??
                              (opener.current?.isConnected
                                  ? opener.current
                                  : null);
                          back?.focus();
                      },
                  }),
        },
        formProps: {
            ref: setForm,
            ...draftWatch(touch),
            noValidate: true,
            // Cmd/Ctrl+Enter sends it, as its button would.
            onKeyDown: submitOnModEnter,
            onSubmit: async (event: FormEvent<HTMLFormElement>) => {
                // A form of its own inside a field (a link box in a
                // popover) hands its submit up to this one, and it isn't
                // the overlay's button.
                if (event.target !== event.currentTarget) return;
                event.preventDefault();
                // Portalled, but React still bubbles a submit up its tree:
                // never into a form on the page that opened the overlay.
                event.stopPropagation();
                if (pending) return;
                // Only on the overlay's own word: what the fields show is
                // a guess, good enough to guard a stray tap and not good
                // enough to skip a save.
                if (closesUnchanged && (dirty ?? said) === false) {
                    onClose();
                    return;
                }
                await (onSubmit ?? registered.current)?.(event);
                // What is wrong was just said: start at the first of it.
                window.requestAnimationFrame(() => {
                    const el = form.current;
                    if (!el) return;
                    const active = document.activeElement;
                    if (
                        active instanceof HTMLElement &&
                        active.matches(INVALID)
                    )
                        return;
                    el.querySelector<HTMLElement>(INVALID)?.focus();
                });
            },
        },
    };
}

export function OverlayProvider({
    value,
    children,
}: {
    value: OverlayContextValue;
    children: ReactNode;
}) {
    return (
        <OverlayContext.Provider value={value}>
            {children}
        </OverlayContext.Provider>
    );
}

/**
 * For a draft drawn under the frame whose work the fields can't show:
 * call it once with every value the person can change. Once they differ
 * from what the overlay opened with, a press outside no longer closes it.
 */
export function useOverlayDraft(draft: unknown) {
    const { setDirty } = useOverlay();
    const now = JSON.stringify(draft);
    const [first] = useState(now);
    const dirty = now !== first;
    useEffect(() => {
        setDirty(dirty);
    }, [dirty, setDirty]);
}

/** The same, for a draft that already knows whether it has changed. */
export function useOverlayDirty(dirty: boolean) {
    const { setDirty } = useOverlay();
    useEffect(() => {
        setDirty(dirty);
    }, [dirty, setDirty]);
}

/** The fields scroll; the inset keeps a focus ring from being clipped. */
export function OverlayBody({
    className,
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            data-overlay-body
            className={cn(
                "-mx-1 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-1 pb-1 pt-1",
                className,
            )}
        >
            {children}
        </div>
    );
}

export interface OverlayFootProps {
    /**
     * "Save" for an edit; verb and thing for a create or an action ("Add
     * note", "Send invite"). Never "Save changes", "Update" or "Done".
     */
    saveLabel?: string;
    /** While it runs: "Saving…", "Sending…". */
    savingLabel?: string;
    /** The way out: "Cancel", or "Keep order" beside a button that cancels. */
    cancelLabel?: string;
    /** Red only when the button destroys something. */
    tone?: "default" | "destructive";
    /** The button waits on something in the overlay, such as an upload. */
    saveOff?: boolean;
    /** A line above the buttons: what the button does, or does not do. */
    note?: ReactNode;
    /** A quieter action at the far side, such as Delete. */
    extra?: ReactNode;
    /**
     * The overlay holds nothing of its own to save (a list whose rows each
     * open their own edit): its foot is one Done, which closes it.
     */
    doneOnly?: boolean;
    /** With `doneOnly`: "Close" where the overlay can only be read. */
    doneLabel?: string;
    /** For a draft drawn under the frame: what the button does. */
    onSubmit?: OverlaySubmit;
    /** For a draft drawn under the frame that holds the save itself. */
    pending?: boolean;
    className?: string;
}

/**
 * Pinned under the fields with a rule above it: the way out (outline),
 * then the overlay's own button (ink), on the right. On a phone they
 * stack full width with the overlay's button on top. While it saves the
 * label says so and both wait.
 */
export function OverlayFoot({
    saveLabel = "Save",
    savingLabel = "Saving…",
    cancelLabel = "Cancel",
    tone = "default",
    saveOff = false,
    note,
    extra,
    doneOnly = false,
    doneLabel = "Done",
    onSubmit,
    pending: ownPending = false,
    className,
}: OverlayFootProps) {
    const { pending, close, register, setPending } = useOverlay();
    useEffect(() => {
        setPending(ownPending);
        return () => setPending(false);
    }, [ownPending, setPending]);
    const handler = useRef(onSubmit);
    useLayoutEffect(() => {
        handler.current = onSubmit;
    });
    const foot = useRef<HTMLDivElement | null>(null);
    useToastsAboveFoot(foot);
    // Registered once; `handler` follows the latest.
    const own = Boolean(onSubmit);
    useEffect(() => {
        if (!own) return;
        register((event) => handler.current?.(event));
        return () => register(null);
    }, [own, register]);

    return (
        <div
            ref={foot}
            data-overlay-foot
            className={cn(
                "mt-4 grid gap-3 border-t border-border pt-4",
                className,
            )}
        >
            {note}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                {extra ? (
                    <div className="flex sm:mr-auto [&>*]:w-full sm:[&>*]:w-auto">
                        {extra}
                    </div>
                ) : null}
                {doneOnly ? (
                    <Button type="button" onClick={close}>
                        {doneLabel}
                    </Button>
                ) : (
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={pending}
                            onClick={close}
                        >
                            {cancelLabel}
                        </Button>
                        <Button
                            type="submit"
                            variant={
                                tone === "destructive"
                                    ? "destructive"
                                    : "default"
                            }
                            disabled={saveOff}
                            busy={pending}
                            busyLabel={savingLabel}
                        >
                            {saveLabel}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

/** Phone width, where toasts rise from the foot of the screen. */
const PHONE = "(max-width: 759px)";

/** The property toasts' offset reads (`app/providers.tsx`). */
export const FOOT_INSET = "--overlay-foot-inset";

/**
 * On a phone, the room an open overlay's foot takes at the bottom of the
 * screen, said to the toasts (`--overlay-foot-inset`), so one said while
 * the sheet is open — "10:00 am was just booked", an Undo — lands above
 * its buttons rather than over them (BA-23). Cleared when the foot goes.
 */
function useToastsAboveFoot(foot: RefObject<HTMLDivElement | null>) {
    useEffect(() => {
        const el = foot.current;
        if (
            !el ||
            typeof window.matchMedia !== "function" ||
            !window.matchMedia(PHONE).matches
        ) {
            return;
        }
        const root = document.documentElement;
        const say = () => {
            const top = el.getBoundingClientRect().top;
            const inset = Math.max(0, window.innerHeight - top);
            root.style.setProperty(FOOT_INSET, `${Math.round(inset)}px`);
        };
        say();
        const watch =
            typeof ResizeObserver === "function"
                ? new ResizeObserver(say)
                : null;
        watch?.observe(el);
        window.addEventListener("resize", say);
        // A sheet slides in: measured again once it has arrived.
        const frame = el.closest('[role="dialog"], [role="alertdialog"]');
        frame?.addEventListener("animationend", say);
        return () => {
            watch?.disconnect();
            window.removeEventListener("resize", say);
            frame?.removeEventListener("animationend", say);
            root.style.removeProperty(FOOT_INSET);
        };
    }, [foot]);
}
