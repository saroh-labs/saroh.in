"use client";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { onLeaveRequest } from "@/lib/nav/leave-request";

/**
 * Leaving an autosaving editor (D6). A way off the page — a link, the ⌘K
 * menu, Search settings — first saves what is waiting. Only if that save
 * fails, or the record is in a conflict, is the person asked, and the
 * dialog names what they would lose. Closing or reloading the tab while
 * anything is unsaved gets the browser's own warning.
 *
 * Links are caught on the document in the capture phase, before Next's
 * `<Link>` sees the click, as `components/organizations/use-leave-guard.tsx`
 * does for Settings; that guard asks at once, this one saves first.
 */
export function useEditorLeaveGuard({
    unsettled,
    flush,
}: {
    /** Anything on screen the server doesn't have. */
    unsettled: boolean;
    /** Save now; true when everything on screen is on the server. */
    flush: () => Promise<boolean>;
}) {
    const router = useRouter();
    const [leaveTo, setLeaveTo] = useState<string | null>(null);
    // Set once the person has chosen to go, so the guard lets them.
    const going = useRef(false);
    const flushRef = useRef(flush);
    useEffect(() => {
        flushRef.current = flush;
    });

    const go = useCallback(
        (to: string) => {
            going.current = true;
            router.push(to);
        },
        [router],
    );

    useEffect(() => {
        if (!unsettled) return;
        const hold = (href: string) => {
            if (going.current) return false;
            const url = new URL(href, window.location.href);
            if (
                url.origin !== window.location.origin ||
                (url.pathname === window.location.pathname &&
                    url.search === window.location.search)
            ) {
                return false;
            }
            const to = url.pathname + url.search + url.hash;
            void flushRef.current().then(
                (ok) => (ok ? go(to) : setLeaveTo(to)),
                () => setLeaveTo(to),
            );
            return true;
        };
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
            if (!link || link.target === "_blank" || !hold(link.href)) return;
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
    }, [unsettled, go]);

    return {
        leaveTo,
        stay: () => setLeaveTo(null),
        leave: () => {
            const to = leaveTo;
            setLeaveTo(null);
            if (to) go(to);
        },
    };
}

/** "Leave with unsaved changes?" — Stay is the default: the edit is what's at risk. */
export function LeaveDialog({
    open,
    title,
    body,
    onStay,
    onLeave,
}: {
    open: boolean;
    title: string;
    body: string;
    onStay: () => void;
    onLeave: () => void;
}) {
    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onStay();
            }}
        >
            <AlertDialogContent className="max-w-[380px] gap-0 px-[22px] py-5 sm:rounded-[14px]">
                <AlertDialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                    {title}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-[7px] text-pretty text-[13px] leading-[1.55] text-foreground/75">
                    {body}
                </AlertDialogDescription>
                <div className="mt-[18px] flex flex-wrap justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-[38px] rounded-[9px] px-4 text-[13px] font-semibold text-destructive"
                        onClick={onLeave}
                    >
                        Leave without saving
                    </Button>
                    <Button
                        type="button"
                        autoFocus
                        className="h-[38px] rounded-[9px] px-4 text-[13px] font-semibold"
                        onClick={onStay}
                    >
                        Stay
                    </Button>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
