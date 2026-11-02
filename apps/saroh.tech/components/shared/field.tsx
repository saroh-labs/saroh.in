import type { ComponentProps, ReactNode } from "react";

export const INPUT_CLASS =
    "h-11 w-full rounded-control border border-control bg-surface px-3 text-base text-ink md:h-10 md:text-[15px]";

/** A label and its input, always together. 44px on a phone, 40px on a desk. */
export function Field({
    label,
    hint,
    className = "",
    ...props
}: ComponentProps<"input"> & { label: string; hint?: ReactNode }) {
    return (
        <label className={`flex flex-col gap-1.5 ${className}`}>
            <span className="text-[13px] font-semibold">
                {label}
                {hint ? (
                    <span className="font-normal text-quiet"> {hint}</span>
                ) : null}
            </span>
            <input className={INPUT_CLASS} {...props} />
        </label>
    );
}
