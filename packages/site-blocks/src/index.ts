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

export { BlockFixturePreview, SAMPLE_SERVICES } from "./block-fixture-preview";
export { default as BookingSection } from "./blocks/booking";
export { default as ContactSection } from "./blocks/contact";
export { CtaButton, default as CtaSection, ctaClasses } from "./blocks/cta";
export type { CtaSurface } from "./blocks/cta";
export { default as EnquirySection } from "./blocks/enquiry";
export { default as FaqSection } from "./blocks/faq";
export { default as FeaturesSection } from "./blocks/features";
export { default as GallerySection } from "./blocks/gallery";
export { default as HeroSection } from "./blocks/hero";
export { default as RichTextSection } from "./blocks/rich-text";
export { default as ServicesListSection } from "./blocks/services-list";
export type { PublicService } from "./blocks/services-list";
export { default as TestimonialsSection } from "./blocks/testimonials";

// Not a page block: a product as its shop page shows it (#465) — the
// workspace's Customer view today, the storefront product page later.
export {
    default as ProductPage,
    formatAmount,
    percentOff,
    stockLabel,
} from "./product/product-page";
export type {
    ProductPageData,
    ProductPageImage,
    ProductPageReview,
    ProductPageVariant,
    StockWord,
} from "./product/product-page";

// Not a page block either: the booking page on a merchant's site (U19),
// `/<domain>/book` — every service, two weeks of times, pay now or at the desk.
export {
    default as BookingFlow,
    BookingUnavailable,
} from "./booking-flow/booking-flow";
export type { BookingFlowProps } from "./booking-flow/booking-flow";
export { isBookingPage } from "./booking-flow/model";
export type { BookingPageData, BookingService } from "./booking-flow/model";

export { destructiveAlertClasses } from "./alert";
export { DEFAULT_API_URL } from "./api-url";
export { cn } from "./lib/utils";
export { SiteFooter, SiteHeader } from "./site-chrome";
export type { SiteFooterContent } from "./site-chrome";
export { SiteTheme, SiteThemeScope } from "./site-theme";
