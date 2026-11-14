"use client";

import { selectContents, useCopy } from "@saroh/ui/copy-button";
import { useRef } from "react";

import { track } from "@/lib/analytics";
import { ring } from "@saroh/marketing/ring";

/**
 * "Know another owner? Send them your link." (Waitlist design, done state):
 * the link in mono, cut with an ellipsis when it is long, and Copy, which
 * reads "Copied" once the link is on the clipboard. Where the clipboard is
 * refused, the link is selected instead so it can be copied by hand.
 */
export function ReferralLink({ href, shown }: { href: string; shown: string }) {
    const { copied, copy } = useCopy();
    const text = useRef<HTMLSpanElement>(null);

    async function onCopy() {
        if (await copy(href)) track("referral_copy", {});
        else selectContents(text.current);
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
                    onClick={onCopy}
                    className={`flex h-10 shrink-0 cursor-pointer items-center rounded-mk-control border border-[rgba(28,28,26,0.2)] bg-white px-4 text-[14px] font-medium text-foreground transition-[background-color,transform] duration-fast ease-out hover:bg-muted ${ring({ color: "ink" })} active:scale-[0.97]`}
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
