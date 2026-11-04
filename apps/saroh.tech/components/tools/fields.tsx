"use client";

import { DateInput } from "@saroh/ui/date-picker";
import type { ComponentProps, ReactNode } from "react";
import { useId, useState } from "react";

import { Button } from "@/components/shared/button";
import { INPUT_CLASS } from "@/components/shared/field";

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

export function LabelText({ text, hint }: { text: string; hint?: string }) {
    return (
        <span className="text-[13px] font-semibold">
            {text}
            {hint ? (
                <span className="font-normal text-muted-foreground">
                    {" "}
                    {hint}
                </span>
            ) : null}
        </span>
    );
}

export function TextArea({
    label,
    hint,
    ...props
}: ComponentProps<"textarea"> & { label: string; hint?: string }) {
    return (
        <label className="flex flex-col gap-1.5">
            <LabelText text={label} hint={hint} />
            <textarea
                rows={3}
                className={`${INPUT_CLASS} !h-auto py-2.5`}
                {...props}
            />
        </label>
    );
}

export function SelectField<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: readonly { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <LabelText text={label} />
            <select
                value={value}
                onChange={(e) => onChange(e.target.value as T)}
                className={INPUT_CLASS}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

export function DateField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    const id = useId();
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id}>
                <LabelText text={label} />
            </label>
            <DateInput
                id={id}
                value={value}
                onValueChange={onChange}
                className="h-11 w-full rounded-mk-control border-border-strong bg-card font-sans text-base font-normal text-foreground shadow-none md:h-10 md:text-[15px]"
            />
        </div>
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
