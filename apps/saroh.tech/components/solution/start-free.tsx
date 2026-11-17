import { ButtonLink } from "@saroh/marketing/button";

import { signupHref } from "@/site.config";

/** A Solutions page's "Start free", in the redesign's size, with the page that brought them. */
export function StartFree({
    src,
    from,
    variant = "primary",
    className,
}: {
    /** The sign-up link's `src`, e.g. `solutions-shops-hero`. */
    src: string;
    /** What PostHog calls this click. */
    from: string;
    variant?: "primary" | "secondary";
    className?: string;
}) {
    return (
        <ButtonLink
            href={signupHref(src)}
            size="kit"
            variant={variant}
            data-cta={from}
            className={className}
        >
            Start free
        </ButtonLink>
    );
}
