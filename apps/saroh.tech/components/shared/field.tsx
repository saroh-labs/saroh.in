import { ring } from "@saroh/marketing/ring";
import type { ComponentProps, ReactNode } from "react";

export const INPUT_CLASS = `h-11 w-full rounded-mk-control border border-border-strong bg-white px-3.5 text-base text-foreground transition-colors duration-fast ease-out hover:border-foreground focus:border-border-strong focus:ring-0 focus:ring-offset-0 md:h-10 md:text-[15px] ${ring()}`;

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
                    <span className="font-normal text-muted-foreground">
                        {" "}
                        {hint}
                    </span>
                ) : null}
            </span>
            <input className={INPUT_CLASS} {...props} />
        </label>
    );
}
