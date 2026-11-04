import { ButtonLink } from "@saroh/marketing/button";

import { signupHref } from "@/site.config";

/** A hero's start button, and the closing band's: Saffron on Ink. */
export function HeroActions({
    src,
    onInk = false,
}: {
    /** Where the sign-up came from, e.g. `feature-billing-band`. */
    src: string;
    onInk?: boolean;
}) {
    return (
        <div className="flex flex-wrap gap-3">
            <ButtonLink
                href={signupHref(src)}
                variant={onInk ? "saffron" : "primary"}
                data-cta={onInk ? "start-free-band" : "start-free-page"}
            >
                Start free
            </ButtonLink>
        </div>
    );
}
