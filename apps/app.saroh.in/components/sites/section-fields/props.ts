import type { Section, SectionType, SitePage } from "@/lib/sites/service";

import type { ServiceOption } from "./types";

/**
 * What every per-type section editor is handed (#260).
 *
 * One props shape for all six so the dispatcher stays a short, uniform switch
 * rather than six bespoke call signatures. `section` is narrowed to the exact
 * variant, which is what makes `section.content` the right shape without a cast
 * — the `Section` union is discriminated on `type` precisely so this works.
 *
 * Editors take what they need and ignore the rest: only hero and cta use
 * `pages`, only booking uses `services`.
 */
export interface SectionFieldsProps<K extends SectionType> {
    section: Extract<Section, { type: K }>;
    /** The site's pages, so a button can pick one rather than type a path. */
    pages: SitePage[];
    /** The org's bookable services, for the booking picker. */
    services: ServiceOption[];
    onChange: (next: Section) => void;
}
