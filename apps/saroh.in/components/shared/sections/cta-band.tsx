import { CtaBand as Band } from "@saroh/marketing/cta-band";

import { CTA_BAND } from "@/content/home";
import type { PlanId } from "@/lib/links";

import { HeroActions } from "../buttons/hero-actions";

/**
 * The dark band every page closes with: the page's own title, the shared
 * body, the Saffron start button and "No card needed to start." The "See it
 * in action · 2 min" button shows only once a tour video is configured
 * (KTD-12, deviation D-3). The Templates pages pass their `template` (the
 * start button saves it) and `note={null}` (DEC-195, V4).
 */
export function CtaBand({
    title,
    src,
    plan,
    template,
    body = CTA_BAND.body,
    note = CTA_BAND.note,
    className,
}: {
    title: string;
    /** Analytics source for the start button, e.g. `home-band`. */
    src: string;
    plan?: PlanId;
    /** A gallery template the start button saves (`cta`'s `template`). */
    template?: { slug: string; name: string };
    body?: string;
    /** The line under the buttons; null for none. */
    note?: string | null;
    /** The space above, where a design draws it other than 110px. */
    className?: string;
}) {
    return (
        <Band
            title={title}
            body={body}
            note={note}
            className={className}
            actions={
                <HeroActions src={src} plan={plan} template={template} onInk />
            }
        />
    );
}
