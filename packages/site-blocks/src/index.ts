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

export {
    BlockFixturePreview,
    SAMPLE_POSTS,
    SAMPLE_SERVICES,
    SAMPLE_VISIT,
} from "./block-fixture-preview";
export { default as BookingSection } from "./blocks/booking";
export { default as ContactSection } from "./blocks/contact";
export { CtaButton, default as CtaSection, ctaClasses } from "./blocks/cta";
export type { CtaSurface } from "./blocks/cta";
export { default as EnquirySection } from "./blocks/enquiry";
export { default as FaqSection } from "./blocks/faq";
export { default as FeaturesSection } from "./blocks/features";
export { default as GallerySection } from "./blocks/gallery";
export { default as HeroSection } from "./blocks/hero";
export {
    default as JournalSection,
    postExcerpt,
    postEyebrow,
} from "./blocks/journal";
export type { JournalFeed, JournalPost } from "./blocks/journal";
export {
    default as OnTodayHero,
    isPublicToday,
    todayHref,
} from "./blocks/on-today";
export type { PublicToday, PublicTodayItem } from "./blocks/on-today";
export { default as RichTextSection } from "./blocks/rich-text";
export { default as ServicesListSection } from "./blocks/services-list";
export type { PublicService } from "./blocks/services-list";
export { default as TestimonialsSection } from "./blocks/testimonials";
export {
    default as VisitUsSection,
    directionsHref,
    isPublicVisit,
} from "./blocks/visit-us";
export type { PublicVisit } from "./blocks/visit-us";

// The one rule for "Open now" (G8): Visit us, the hero's On today (G18) and
// the booking page's header (E6) all say it through this.
export {
    FALLBACK_TIME_ZONE,
    clockText,
    isOpeningWeek,
    openState,
    openStateText,
    weekSummary,
} from "./lib/opening-hours";
export type { OpenState, OpeningHoursDay, Weekday } from "./lib/opening-hours";

// Not a page block: a product as its shop page shows it (#465) — the
// workspace's Customer view today, the storefront product page later.
export {
    default as ProductPage,
    formatAmount,
    percentOff,
    stockLabel,
    useProductSelection,
} from "./product/product-page";
export type {
    ProductPageData,
    ProductPageImage,
    ProductPageReview,
    ProductPageVariant,
    ProductSelection,
    StockWord,
} from "./product/product-page";

// The shop on a merchant's site (G11), `/shop`: every product its
// sells-from storefront sells, each card opening the product page.
export {
    default as ShopListing,
    ShopUnavailable,
} from "./product/shop-listing";
export type { ShopListingCard } from "./product/shop-listing";

// The bag and checkout on a merchant's site (G13): Add to bag or "Ask about
// ordering" in the product page's action slot, and the header's bag with
// its sheets. The site's server actions arrive as a `ShopCheckoutApi`.
export { AddToBag } from "./shop/add-to-bag";
export { SHOP_OFFLINE } from "./shop/api";
export type {
    CheckoutQuote,
    CheckoutStanding,
    CheckoutStarted,
    DeliveryAddress,
    QuoteLine,
    QuoteWay,
    ShopCheckoutApi,
    ShopProblem,
    ShopResult,
    ShopWay,
    StartCheckout,
} from "./shop/api";
export { AskAboutOrdering, askAboutHref } from "./shop/ask-about-ordering";
export { ShopBag } from "./shop/bag";
export type { ShopBagProps } from "./shop/bag";
export type { BagItem } from "./shop/bag-store";

// Not a page block either: the booking page on a merchant's site (U19),
// `/<domain>/book` — every service, two weeks of times, pay now or at the desk.
export {
    default as BookingFlow,
    BookingUnavailable,
} from "./booking-flow/booking-flow";
export type {
    BookingAccount,
    BookingFlowProps,
} from "./booking-flow/booking-flow";
export { initialDateOf, initialTimeOf } from "./booking-flow/initial-start";
export {
    isBookResult,
    isBookingPage,
    isCreditAnswer,
} from "./booking-flow/model";
export type {
    BookResult,
    BookingPageData,
    BookingService,
    CreditAnswer,
} from "./booking-flow/model";
// Booking signed in (A9): the site's server action books, and answers the
// page in the page's own terms.
export { OFFLINE_RESULT, resultOf } from "./booking-flow/api";
export type {
    BookSignedIn,
    Result as BookingResult,
    CreditFor,
    SignedInBookRequest,
} from "./booking-flow/api";

// Not a page block: signing in on a merchant's site (ADR-011, plan A, A3).
// The site's server actions arrive as `api`; the sheet never calls the API.
export { UNAVAILABLE_TEXT, callLine, retryText } from "./account/api";
export type {
    CodeRequestResult,
    SignInApi,
    SignInOptions,
    SignedInCustomer,
    VerifyResult,
} from "./account/api";
export { SignInSheet } from "./account/sign-in-sheet";
export type { SignInSheetProps } from "./account/sign-in-sheet";

// The customer account area (plan A, A5): the header's entry, the tab bar,
// Home and Me. Data arrives from the site's server; changes go through its
// server actions.
export { AccountEntry } from "./account/account-entry";
export { AccountHome } from "./account/account-home";
export { Me } from "./account/me";
export type { DetailsResult, MeApi, MeProps, NoteResult } from "./account/me";
// The Plan tab (plan A, A8).
export type {
    Block as AccountBlock,
    AccountBooking,
    AccountClasses,
    AccountHome as AccountHomeData,
    AccountNote,
    AccountOrder,
    AccountPack,
    AccountPlan,
    AccountPlanTab,
    AccountReceipt,
    AccountSubscription,
    AccountTab,
    AccountTabKey,
    AccountView,
} from "./account/model";
export { AccountCard } from "./account/parts";
export { PlanTab } from "./account/plan-tab";
export type {
    PayNowResult,
    PlanApi,
    PlanChangeResult,
    PlanTabProps,
} from "./account/plan-tab";
export { ACCOUNT_TAB_HREF, AccountTabBar } from "./account/tab-bar";

export { destructiveAlertClasses } from "./alert";
export { DEFAULT_API_URL } from "./api-url";
export { cn } from "./lib/utils";
export { SiteFooter, SiteHeader, footerLine } from "./site-chrome";
export type { SiteFooterContent } from "./site-chrome";
export type { SiteHeaderAction, SiteNavItem } from "./site-header-menu";
export { SiteTheme, SiteThemeScope } from "./site-theme";
