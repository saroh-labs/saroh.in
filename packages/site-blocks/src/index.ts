/**
 * The blocks a merchant's website is built from (#252).
 *
 * ONE implementation, three consumers: `saroh.app` renders published sites with
 * it, `app.saroh.in` previews drafts with it, and `ui.saroh.in` catalogues it.
 * Before this package there were two implementations and #189 — a per-section
 * padding the editor honoured and the live site ignored — is what their
 * disagreeing looked like to a merchant.
 *
 * WHAT THIS PACKAGE MAY IMPORT: React, `next/link`, `clsx`/`tailwind-merge`,
 * and `@saroh/block-contract`. Not `@saroh/ui` — that is Saroh's brand layer,
 * and a merchant's storefront must never inherit it. Gate G1 enforces this;
 * it is not a convention.
 */
export { PageSections, default as SectionRenderer } from "./section-renderer";
export type { Section } from "./section-renderer";

export { default as BookingSection } from "./blocks/booking";
export { CtaButton, default as CtaSection, ctaClasses } from "./blocks/cta";
export type { CtaSurface } from "./blocks/cta";
export { default as EnquirySection } from "./blocks/enquiry";
export { default as GallerySection } from "./blocks/gallery";
export { default as HeroSection } from "./blocks/hero";
export { default as RichTextSection } from "./blocks/rich-text";

export { destructiveAlertClasses } from "./alert";
export { DEFAULT_API_URL } from "./api-url";
export { cn } from "./lib/utils";
export { SiteTheme, SiteThemeScope } from "./site-theme";
