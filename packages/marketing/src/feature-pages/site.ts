import type { ReactNode } from "react";

import type { ClaimSwitch } from "../content/feature-switches";
import type { ShotView } from "../media/shot";

/**
 * What a shared page needs from the site that draws it (DEC-221: one
 * design, two editions): its start button, its switches, its links and its
 * screenshots. Each edition passes its own; a shared part never reads a
 * site's `lib/` or `content/` itself.
 */
export interface PageSite {
    /** The site's 48px start button for this place (`cta()`; `src` names it). */
    start: (src: string, className?: string) => ReactNode;
    /** A claim is drawn only while this says so (`claimOn`, DEC-221). */
    claimOn: (claim: ClaimSwitch) => boolean;
    /** The launch switch is open: plan terms and Pricing may be named. */
    open: boolean;
    /** A feature's page while this build shows it, else null (link nothing). */
    featureHref: (slug: string) => string | null;
    /** A captured screen for a shot key, or the neutral frame of a pending one. */
    shot: (key?: string, alt?: string, phone?: string) => ShotView | undefined;
}
