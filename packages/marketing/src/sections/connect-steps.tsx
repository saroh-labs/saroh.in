"use client";

import { selectContents, useCopy } from "@saroh/ui/copy-button";
import Link from "next/link";
import { useRef } from "react";

import { buttonClasses } from "../buttons/button";
import { cn } from "../cn";
import { ring } from "../ring";
import { Section } from "./section";

/**
 * "Paste one address" (AI apps, board R2Apps2 variant I, owner 16 Nov): the
 * MCP address set large in mono between two Ink rules, with Copy; the
 * numbered steps in Saffron; then "Step-by-step for" pills to each app's
 * guide. The address is shown without `https://` and copied whole. Copy
 * reads "Copied" through `aria-live`; where the clipboard is refused, the
 * address is selected so it can be copied by hand.
 */
export function ConnectSteps({
    id,
    title,
    lede,
    address,
    steps,
    guides,
    words,
}: {
    id: string;
    title: string;
    lede?: string;
    /** The full URL, `https://` and all: what Copy puts on the clipboard. */
    address: string;
    steps: readonly { title: string; body: string }[];
    /** Each app's guide; `icon` is the app's mark (decorative, the label names it). */
    guides: readonly { href: string; label: string; icon?: string }[];
    words: {
        copy: string;
        copied: string;
        /** Said when the clipboard refused: the address is selected instead. */
        failed: string;
        /** "Step-by-step for". */
        guides: string;
    };
}) {
    const { state, copy } = useCopy();
    const shown = useRef<HTMLElement>(null);

    async function onCopy() {
        if (!(await copy(address))) selectContents(shown.current);
    }

    return (
        <Section
            id={id}
            titleId={`${id}-title`}
            title={title}
            lead={lede}
            size="kit-h2"
            className="scroll-mt-24 pt-12 min-[760px]:pt-[120px]"
        >
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4 border-y-2 border-foreground py-5 min-[760px]:mt-10 min-[760px]:py-[22px]">
                <code
                    ref={shown}
                    className="min-w-0 flex-1 font-mono text-mk-address font-medium [overflow-wrap:anywhere]"
                >
                    {address.replace(/^https?:\/\//, "")}
                </code>
                <button
                    type="button"
                    onClick={onCopy}
                    className={buttonClasses({ size: "kit" })}
                >
                    {state === "copied" ? words.copied : words.copy}
                </button>
                <span aria-live="polite" className="sr-only">
                    {state === "copied"
                        ? words.copied
                        : state === "failed"
                          ? words.failed
                          : ""}
                </span>
            </div>
            <ol className="m-0 mt-10 grid list-none items-start gap-8 p-0 min-[760px]:grid-cols-3 min-[760px]:gap-10">
                {steps.map((step, i) => (
                    <li key={step.title} className="grid content-start gap-2">
                        <span
                            aria-hidden
                            className="font-display text-[40px] font-bold leading-none text-brand-500"
                        >
                            {i + 1}
                        </span>
                        <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                            {step.title}
                        </h3>
                        <p className="m-0 text-[15.5px] leading-normal text-mk-copy [text-wrap:pretty]">
                            {step.body}
                        </p>
                    </li>
                ))}
            </ol>
            {guides.length ? (
                <div className="mt-10 flex flex-wrap items-center gap-2.5">
                    <span className="mr-1.5 text-[14px] text-muted-foreground">
                        {words.guides}
                    </span>
                    {guides.map((g) => (
                        <Link
                            key={g.href}
                            href={g.href}
                            className={cn(
                                "inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-[14px] font-semibold text-foreground no-underline transition-colors duration-fast ease-out hover:bg-mk-hover",
                                g.icon && "pl-2.5",
                                ring(),
                            )}
                        >
                            {g.icon ? (
                                <img
                                    src={g.icon}
                                    alt=""
                                    width={20}
                                    height={20}
                                    className="block size-5"
                                />
                            ) : null}
                            {g.label}
                        </Link>
                    ))}
                </div>
            ) : null}
        </Section>
    );
}
