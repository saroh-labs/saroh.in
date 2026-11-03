import Link from "next/link";
import type { ComponentProps } from "react";

/** The quiet next step beside a button. 44px to tap on a phone. */
export function TextLink({
    className = "",
    ...props
}: ComponentProps<typeof Link>) {
    return (
        <Link
            prefetch={false}
            className={`inline-flex min-h-11 items-center text-base font-semibold md:min-h-0 ${className}`}
            {...props}
        />
    );
}
