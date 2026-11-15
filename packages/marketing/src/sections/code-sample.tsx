"use client";

import { selectContents, useCopy } from "@saroh/ui/copy-button";
import { useRef } from "react";

import { cn } from "../cn";
import { ring } from "../ring";

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
    const { state, copy } = useCopy();
    const copied = state === "copied";
    const failed = state === "failed";
    const block = useRef<HTMLElement>(null);

    async function onCopy() {
        if (!(await copy(code))) selectContents(block.current);
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
                    onClick={onCopy}
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
