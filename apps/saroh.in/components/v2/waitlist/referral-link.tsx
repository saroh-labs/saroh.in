"use client";

import { useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics";

/** How long "Copied" stays before the button reads "Copy" again. */
const COPIED_MS = 2000;

/**
 * "Know another owner? Send them your link." (Waitlist design, done state):
 * the link in mono, cut with an ellipsis when it is long, and Copy, which
 * reads "Copied" once the link is on the clipboard. Where the clipboard is
 * refused, the link is selected instead so it can be copied by hand.
 */
export function ReferralLink({ href, shown }: { href: string; shown: string }) {
    const [copied, setCopied] = useState(false);
    const text = useRef<HTMLSpanElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    async function copy() {
        try {
            await navigator.clipboard.writeText(href);
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), COPIED_MS);
            track("referral_copy", {});
        } catch {
            const node = text.current;
            const selection = window.getSelection();
            if (node && selection) {
                const range = document.createRange();
                range.selectNodeContents(node);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }

    return (
        <div className="flex flex-col gap-2.5 rounded-xl border border-[rgba(28,28,26,0.13)] bg-background p-3.5">
            <span id="waitlist-ref-label" className="text-[13px] font-medium">
                Know another owner? Send them your link.
            </span>
            <div className="flex gap-2">
                <span
                    ref={text}
                    title={href}
                    className="flex h-10 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-mk-control border border-border bg-white px-3 font-mono text-[12px]"
                >
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {shown}
                    </span>
                </span>
                <button
                    type="button"
                    onClick={copy}
                    className="flex h-10 shrink-0 cursor-pointer items-center rounded-mk-control border border-[rgba(28,28,26,0.2)] bg-white px-4 text-[14px] font-medium text-foreground transition-[background-color,transform] duration-fast ease-out hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground focus-visible:[outline-style:solid] active:scale-[0.97]"
                >
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <span aria-live="polite" className="sr-only">
                {copied ? "Link copied" : ""}
            </span>
        </div>
    );
}
