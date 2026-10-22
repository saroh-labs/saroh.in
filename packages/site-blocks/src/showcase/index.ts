/**
 * `@saroh/site-blocks/showcase`: a gallery template drawn for its sample
 * business, with no API (industry templates U14, DEC-182). Read by the
 * gallery's `/template-renders` and by a look's Preview in the editor.
 */
export { briefImage, hslOf, wrapBrief } from "./brief-image";
export type { BriefColours } from "./brief-image";
export {
    FIXTURE_DAY,
    FIXTURE_NOW,
    FIXTURE_TIME_ZONE,
    STARTER_SAMPLES,
    TEMPLATE_FIXTURES,
} from "./fixtures";
export type { StarterSample, TemplateFixture } from "./fixtures";
export {
    drawBriefs,
    galleryTemplates,
    isGalleryTemplate,
    pageFileName,
    sampleContext,
    sampleEmail,
    templateRender,
    templateRenderIndex,
} from "./render";
export type { TemplateRender, TemplateRenderEntry } from "./render";
