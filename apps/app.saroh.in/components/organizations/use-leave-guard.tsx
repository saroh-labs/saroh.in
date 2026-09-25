"use client";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Hold a way off this page while an edit is unsaved ("Saroh Settings"
 * design): a link to another page — the rail, the settings tabs — is stopped
 * and asked about first, and closing or reloading the tab gets the browser's
 * own warning.
 *
 * Links are caught on the document in the capture phase, before Next's
 * `<Link>` sees the click, so nothing navigates until the person chooses. A
 * link that stays on this page, opens a new tab, or is clicked with a
 * modifier (a new window) is left alone.
 */
export function useLeaveGuard(dirty: boolean) {
    const [leaveTo, setLeaveTo] = useState<string | null>(null);

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
            if (!link || link.target === "_blank") return;
            const url = new URL(link.href, window.location.href);
            if (
                url.origin !== window.location.origin ||
                url.pathname === window.location.pathname
            ) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            setLeaveTo(url.pathname + url.search + url.hash);
        };
        const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
        document.addEventListener("click", onClick, true);
        window.addEventListener("beforeunload", onUnload);
        return () => {
            document.removeEventListener("click", onClick, true);
            window.removeEventListener("beforeunload", onUnload);
        };
    }, [dirty]);

    return {
        leaveTo,
        stay: () => setLeaveTo(null),
    };
}

/**
 * "Leave with unsaved changes in Tax and invoices?" — Keep editing is the
 * default, because the edit is what someone stands to lose.
 */
export function LeaveDialog({
    to,
    section,
    onKeep,
    onDiscard,
}: {
    /** Where they were going; `null` closes the dialog. */
    to: string | null;
    section: string;
    onKeep: () => void;
    /** Throw the edit away; the dialog then goes on to `to`. */
    onDiscard: () => void;
}) {
    const router = useRouter();
    return (
        <AlertDialog
            open={to !== null}
            onOpenChange={(open) => {
                if (!open) onKeep();
            }}
        >
            <AlertDialogContent className="max-w-[400px] gap-0 px-[22px] py-5 sm:rounded-[14px]">
                <AlertDialogTitle className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                    Leave with unsaved changes in {section}?
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-1.5 text-pretty text-[13.5px] leading-[1.55] text-foreground/80">
                    Leaving now throws the change away. Nothing has been saved
                    yet.
                </AlertDialogDescription>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => {
                            const go = to;
                            onDiscard();
                            if (go) router.push(go);
                        }}
                    >
                        Discard changes
                    </Button>
                    <Button type="button" autoFocus onClick={onKeep}>
                        Keep editing
                    </Button>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
