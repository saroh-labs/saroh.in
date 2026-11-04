"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/shared/button";

/** One titled block of a tool's form. */
export function Section({
    title,
    aside,
    children,
}: {
    title: string;
    aside?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-3.5 rounded-mk-card border border-border bg-card p-4 md:px-6 md:py-[22px]">
            <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 font-display text-lg font-semibold tracking-[-0.02em]">
                    {title}
                </h2>
                {aside}
            </div>
            {children}
        </section>
    );
}

/** Copies, and says so where a screen reader hears it. */
export function CopyButton({
    text,
    label,
    onCopied,
    className,
}: {
    text: string;
    label: string;
    onCopied?: () => void;
    className?: string;
}) {
    const [state, setState] = useState<"idle" | "done" | "failed">("idle");
    return (
        <Button
            look="secondary"
            className={className}
            aria-live="polite"
            onClick={() => {
                void navigator.clipboard
                    .writeText(text)
                    .then(() => {
                        setState("done");
                        onCopied?.();
                    })
                    .catch(() => setState("failed"));
            }}
        >
            {state === "done"
                ? "Copied"
                : state === "failed"
                  ? "Select it and copy"
                  : label}
        </Button>
    );
}
