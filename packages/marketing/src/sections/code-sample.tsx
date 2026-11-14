"use client";

import { copyText } from "@saroh/ui/copy-button";
import { useEffect, useRef, useState } from "react";

import { cn } from "../cn";
import { ring } from "../ring";

/** How long "Copied" stays before the button reads "Copy" again. */
const COPIED_MS = 2000;

/**
 * A code sample on Ink (board VFDevelopers): a request, its answer or a
 * webhook check, in mono, with Copy. Copy reads "Copied" once the code is on
 * the clipboard, said through `aria-live`; where the clipboard is refused,
 * the code is selected so it can be copied by hand.
 *
 * Lines starting `#` or `//` are comments, drawn muted. The words are the
 * sample's own text: no highlighting markup, so what is copied is what is
 * shown.
 */
export function CodeSample({
    code,
    title,
    className,
}: {
    code: string;
    /** The bar's name: "Terminal", "Your server". Also names the Copy button. */
    title: string;
    className?: string;
}) {
    const [copied, setCopied] = useState(false);
    const [failed, setFailed] = useState(false);
    const block = useRef<HTMLElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    async function copy() {
        if (await copyText(code)) {
            setFailed(false);
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), COPIED_MS);
            return;
        }
        setFailed(true);
        const node = block.current;
        const selection = window.getSelection();
        if (node && selection) {
            const range = document.createRange();
            range.selectNodeContents(node);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    return (
        <div
            className={cn(
                "min-w-0 overflow-hidden rounded-xl bg-foreground text-background",
                className,
            )}
        >
            <div className="flex items-center gap-2 border-b border-mk-on-ink-line px-3.5 py-2">
                <span className="text-[12px] text-mk-on-ink-muted">
                    {title}
                </span>
                <button
                    type="button"
                    onClick={copy}
                    aria-label={`Copy ${title.toLowerCase()} code`}
                    className={`ml-auto inline-flex h-8 cursor-pointer items-center rounded-md px-2.5 text-[12.5px] font-semibold text-background transition-colors duration-fast ease-out hover:bg-mk-on-ink-hover ${ring({ color: "paper" })}`}
                >
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <pre className="m-0 overflow-x-auto p-4 font-mono text-[12px] leading-[1.6] sm:p-[18px] sm:text-[12.5px]">
                <code ref={block}>
                    {code.split("\n").map((line, i) => (
                        // A line's place is its identity: the sample never reorders.
                        <span key={i} className="block">
                            {/^\s*(#|\/\/)/.test(line) ? (
                                <span className="text-mk-on-ink-muted">
                                    {line}
                                </span>
                            ) : (
                                line || " "
                            )}
                        </span>
                    ))}
                </code>
            </pre>
            <span aria-live="polite" className="sr-only">
                {copied
                    ? "Copied"
                    : failed
                      ? "Couldn't copy. The code is selected: copy it by hand."
                      : ""}
            </span>
        </div>
    );
}
