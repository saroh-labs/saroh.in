import { buttonClasses } from "@saroh/marketing/button";
import Link from "next/link";
import type { ComponentProps } from "react";

const LOOK = {
    /** One per screen: the page's next step. */
    primary: { variant: "primary", size: "lg" },
    secondary: { variant: "secondary", size: "sm" },
    compact: { variant: "secondary", size: "sm" },
} as const;

export type ButtonLook = keyof typeof LOOK;

/** saroh.in's buttons, under the names these pages use until U9 refits them. */
export const buttonClass = (look: ButtonLook = "primary", className = "") =>
    buttonClasses({ ...LOOK[look], className });

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
            className={buttonClass(look, className)}
            {...props}
        />
    );
}
