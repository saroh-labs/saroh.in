import Link from "next/link";
import type { ComponentProps } from "react";

const BASE =
    "inline-flex items-center justify-center rounded-button font-semibold no-underline transition-colors duration-150";

const LOOK = {
    /** One per screen: the page's next step. */
    primary: "h-[52px] bg-ink px-6 text-base text-paper hover:bg-[#33332f]",
    secondary:
        "h-11 border border-strong bg-transparent px-4 text-[15px] text-ink hover:bg-black/5",
    /** The header's "Start free". */
    compact:
        "h-11 border border-strong bg-transparent px-4 text-[15px] text-ink hover:bg-black/5 md:h-10",
} as const;

export type ButtonLook = keyof typeof LOOK;

export const buttonClass = (look: ButtonLook = "primary", className = "") =>
    `${BASE} ${LOOK[look]} ${className}`.trim();

export function ButtonLink({
    look,
    className,
    ...props
}: ComponentProps<typeof Link> & { look?: ButtonLook }) {
    return (
        <Link
            prefetch={false}
            className={buttonClass(look, className)}
            {...props}
        />
    );
}

export function Button({
    look,
    className,
    type = "button",
    ...props
}: ComponentProps<"button"> & { look?: ButtonLook }) {
    return (
        <button
            type={type}
            className={`${buttonClass(look, className)} cursor-pointer`}
            {...props}
        />
    );
}
