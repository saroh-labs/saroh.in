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
        <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">{legend}</legend>
            <div
                className="grid gap-1 rounded-mk-btn bg-mk-hover p-1"
                style={{
                    gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
                }}
            >
                {options.map((o) => (
                    <label
                        key={o.value}
                        className={`flex min-h-11 cursor-pointer items-center justify-center rounded-mk-control px-2 text-center text-[14.5px] font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foreground md:min-h-10 ${
                            value === o.value ? "bg-card shadow-sm" : ""
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
