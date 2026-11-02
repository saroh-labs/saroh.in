"use client";

import { useId } from "react";

/** One of a few, as radio buttons: the arrow keys and labels come with them. */
export function SegmentedControl<T extends string>({
    legend,
    options,
    value,
    onChange,
}: {
    legend: string;
    options: readonly { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
}) {
    const name = useId();
    return (
        <fieldset className="m-0 inline-flex border-0 p-0">
            <legend className="sr-only">{legend}</legend>
            <div className="inline-flex gap-1 rounded-button border border-control bg-surface p-1">
                {options.map((o) => (
                    <label
                        key={o.value}
                        className={`inline-flex min-h-11 cursor-pointer items-center rounded-control px-3 text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink md:min-h-9 ${
                            value === o.value
                                ? "bg-ink text-paper"
                                : "text-ink hover:bg-black/5"
                        }`}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={o.value}
                            checked={value === o.value}
                            onChange={() => onChange(o.value)}
                            className="sr-only"
                        />
                        {o.label}
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
