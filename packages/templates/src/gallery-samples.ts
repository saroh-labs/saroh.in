import { BAKERY_GALLERY_SAMPLE, BAKERY_TEMPLATE_ID } from "./templates/bakery";
import { BLOGS_GALLERY_SAMPLE, BLOGS_TEMPLATE_ID } from "./templates/blogs";
import {
    CERAMICS_GALLERY_SAMPLE,
    CERAMICS_TEMPLATE_ID,
} from "./templates/ceramics";
import { CLINIC_GALLERY_SAMPLE, CLINIC_TEMPLATE_ID } from "./templates/clinic";
import {
    DEVELOPER_GALLERY_SAMPLE,
    DEVELOPER_TEMPLATE_ID,
} from "./templates/developer";
import {
    DIETICIAN_GALLERY_SAMPLE,
    DIETICIAN_TEMPLATE_ID,
} from "./templates/dietician";
import { GYM_GALLERY_SAMPLE, GYM_TEMPLATE_ID } from "./templates/gym";
import { SALON_GALLERY_SAMPLE, SALON_TEMPLATE_ID } from "./templates/salon";
import { STUDIO_GALLERY_SAMPLE, STUDIO_TEMPLATE_ID } from "./templates/studio";

/**
 * Every gallery template's sample words, by template id (KTD-6): what the
 * gallery's render shows where the template leaves the owner a
 * placeholder, from the template's design. Each template exports its own
 * (`*_GALLERY_SAMPLE`, beside the placeholders it replaces); each carries
 * at least the footer's line.
 *
 * GALLERY ONLY. `instantiateTemplate` never reads these, so a merchant's
 * site keeps the placeholders (which the pre-publish check names until
 * they are replaced). The render route (`apps/saroh.app`,
 * `lib/template-renders`) is the one reader: it lays them over the
 * instantiated pages. `gallery-samples.test.ts` holds both sides: every
 * gallery template has one, and none of its words reach a merchant's site.
 */
export const GALLERY_SAMPLES: Readonly<
    Record<string, { readonly footer: string }>
> = {
    [BAKERY_TEMPLATE_ID]: BAKERY_GALLERY_SAMPLE,
    [CERAMICS_TEMPLATE_ID]: CERAMICS_GALLERY_SAMPLE,
    [GYM_TEMPLATE_ID]: GYM_GALLERY_SAMPLE,
    [DIETICIAN_TEMPLATE_ID]: DIETICIAN_GALLERY_SAMPLE,
    [BLOGS_TEMPLATE_ID]: BLOGS_GALLERY_SAMPLE,
    [STUDIO_TEMPLATE_ID]: STUDIO_GALLERY_SAMPLE,
    [DEVELOPER_TEMPLATE_ID]: DEVELOPER_GALLERY_SAMPLE,
    [SALON_TEMPLATE_ID]: SALON_GALLERY_SAMPLE,
    [CLINIC_TEMPLATE_ID]: CLINIC_GALLERY_SAMPLE,
};
