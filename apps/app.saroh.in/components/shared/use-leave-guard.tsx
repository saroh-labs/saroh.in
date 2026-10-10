"use client";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { holdLiveRefresh } from "@/lib/live/refresh";
import { onLeaveRequest } from "@/lib/nav/leave-request";

/** The one question every create and edit flow asks before work is lost. */
export const LEAVE_TITLE = "Leave without saving?";

/** What is lost on the way out of making something new: "discount code". */
export const lostNew = (noun: string) =>
    `The ${noun} isn't created yet, so nothing you've entered will be kept.`;

/** What is lost on the way out of changing something saved: "this course". */
export const lostChanges = (what: string) =>
    `Your changes to ${what} will be lost.`;

export interface LeaveGuardOptions {
    /**
     * Something on screen differs from what is saved. True only once a
     * value has changed: an untouched form, or one whose every change is
     * already saved, lets the person go unasked.
     */
    dirty: boolean;
    /** What leaving loses, in one plain sentence. */
    lost: string;
    /**
     * The flow can keep a draft. Adds "Save and leave", which goes once
     * this answers true and stays, on whatever the save said, when it
     * answers false.
     */
    save?: () => Promise<boolean>;
    /**
     * An editor that saves by itself. A way out first saves what is
     * waiting, and the person is asked only when that save fails.
     */
    flush?: () => Promise<boolean>;
    /**
     * An address that is still this screen, so going there loses nothing:
     * a list's filters and pages while its own state holds the work.
     */
    keeps?: (to: URL) => boolean;
}

export interface LeaveGuard {
    /** The question. Draw it once, anywhere in the flow. */
    dialog: ReactNode;
    /**
     * Go to `href` from the flow's own button: asks first when something
     * is unsaved, as a link there would.
     */
    leaveTo: (href: string) => void;
    /** The work is saved or deliberately dropped: let the next way out go. */
    release: () => void;
}

/**
 * Leaving a create or edit flow with work that isn't saved asks once, in
 * the same words everywhere: "Leave without saving?", what would be lost,
 * then Stay (the default) or Leave.
 *
 * It catches every way off the page the app has: a link (the rail, the
 * breadcrumbs, the flow's own), the ⌘K menu and Search settings (which ask
 * through `lib/nav/leave-request.ts`), and closing or reloading the tab,
 * where the browser shows its own warning. Links are caught on the
 * document in the capture phase, before Next's `<Link>` sees the click.
 * The browser's back button is not caught: Next gives no way to hold it.
 *
 * A link to the same page (another `#hash`), one that opens a new tab and a
 * modified click are let through, since none of them leaves. So is a link
 * inside `data-leave-guard="off"`: the site editor's canvas draws the
 * merchant's own links and answers them itself.
 */
export function useLeaveGuard({
    dirty,
    lost,
    save,
    flush,
    keeps,
}: LeaveGuardOptions): LeaveGuard {
    const router = useRouter();
    const [to, setTo] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    // Set once the person has chosen to go, so the guard lets them.
    const going = useRef(false);
    const flushRef = useRef(flush);
    const saveRef = useRef(save);
    const keepsRef = useRef(keeps);
    useEffect(() => {
        flushRef.current = flush;
        saveRef.current = save;
        keepsRef.current = keeps;
    });
    // Clean again (saved, or put back as it was): the next edit asks anew.
    useEffect(() => {
        if (!dirty) going.current = false;
    }, [dirty]);
    // Unsaved work: the page doesn't read itself again under it
    // (`useLiveRefresh`), until it is saved, put back or left.
    useEffect(() => {
        if (dirty) return holdLiveRefresh();
    }, [dirty]);

    const go = useCallback(
        (href: string) => {
            going.current = true;
            router.push(href);
        },
        [router],
    );

    /** True when the way to `href` was held, and the guard now owns it. */
    const hold = useCallback(
        (href: string): boolean => {
            if (going.current) return false;
            const url = new URL(href, window.location.href);
            if (
                url.origin !== window.location.origin ||
                (url.pathname === window.location.pathname &&
                    url.search === window.location.search) ||
                keepsRef.current?.(url)
            ) {
                return false;
            }
            const dest = url.pathname + url.search + url.hash;
            const save = flushRef.current;
            if (save) {
                void save().then(
                    (ok) => (ok ? go(dest) : setTo(dest)),
                    () => setTo(dest),
                );
            } else {
                setTo(dest);
            }
            return true;
        },
        [go],
    );

    useEffect(() => {
        if (!dirty) return;
        const onClick = (e: MouseEvent) => {
            if (
                e.defaultPrevented ||
                e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey
            ) {
                return;
            }
            const link =
                e.target instanceof Element
                    ? e.target.closest<HTMLAnchorElement>("a[href]")
                    : null;
            if (
                !link ||
                link.target === "_blank" ||
                link.hasAttribute("download") ||
                // A merchant's page drawn on a canvas answers its own links.
                link.closest('[data-leave-guard="off"]') ||
                !hold(link.href)
            ) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
        };
        const onUnload = (e: BeforeUnloadEvent) => {
            if (!going.current) e.preventDefault();
        };
        document.addEventListener("click", onClick, true);
        window.addEventListener("beforeunload", onUnload);
        const offRequest = onLeaveRequest(hold);
        return () => {
            document.removeEventListener("click", onClick, true);
            window.removeEventListener("beforeunload", onUnload);
            offRequest();
        };
    }, [dirty, hold]);

    const stay = () => {
        if (!saving) setTo(null);
    };
    const leave = () => {
        const dest = to;
        setTo(null);
        if (dest) go(dest);
    };
    const saveAndLeave = async () => {
        const dest = to;
        const run = saveRef.current;
        if (!dest || !run) return;
        setSaving(true);
        const ok = await run().catch(() => false);
        setSaving(false);
        setTo(null);
        if (ok) go(dest);
    };

    return {
        dialog: (
            <LeaveDialog
                open={to !== null}
                lost={lost}
                saving={saving}
                onStay={stay}
                onLeave={leave}
                onSaveAndLeave={save ? () => void saveAndLeave() : undefined}
            />
        ),
        leaveTo: (href) => {
            if (!dirty || !hold(href)) router.push(href);
        },
        release: () => {
            going.current = true;
        },
    };
}

/**
 * "Leave without saving?" Stay is the default and takes the keyboard: the
 * work is what's at risk. Escape stays too.
 */
export function LeaveDialog({
    open,
    lost,
    saving = false,
    onStay,
    onLeave,
    onSaveAndLeave,
}: {
    open: boolean;
    /** What leaving loses, in one plain sentence. */
    lost: string;
    saving?: boolean;
    onStay: () => void;
    onLeave: () => void;
    /** Only where the flow can keep a draft. */
    onSaveAndLeave?: () => void;
}) {
    const stayRef = useRef<HTMLButtonElement>(null);
    const button = "h-[38px] rounded-[9px] px-4 text-[13px] font-semibold";
    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onStay();
            }}
        >
            <AlertDialogContent
                className="max-w-[400px] gap-0 px-[22px] py-5 sm:rounded-[14px]"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    stayRef.current?.focus();
                }}
            >
                <AlertDialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                    {LEAVE_TITLE}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-[7px] text-pretty text-[13px] leading-[1.55] text-foreground/75">
                    {lost}
                </AlertDialogDescription>
                <div className="mt-[18px] flex flex-wrap justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={saving}
                        className={`${button} text-destructive`}
                        onClick={onLeave}
                    >
                        Leave
                    </Button>
                    {onSaveAndLeave ? (
                        <Button
                            type="button"
                            variant="outline"
                            className={button}
                            onClick={onSaveAndLeave}
                            busy={saving}
                            busyLabel="Saving…"
                        >
                            Save and leave
                        </Button>
                    ) : null}
                    <Button
                        ref={stayRef}
                        type="button"
                        disabled={saving}
                        className={button}
                        onClick={onStay}
                    >
                        Stay
                    </Button>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
