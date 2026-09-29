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
    SAMPLE_PLANS,
    SAMPLE_POSTS,
    SAMPLE_PRODUCTS,
    SAMPLE_SERVICES,
    SAMPLE_VISIT,
} from "./block-fixture-preview";
export { default as BookingSection } from "./blocks/booking";
export { default as ContactSection } from "./blocks/contact";
export { CtaButton, default as CtaSection, ctaClasses } from "./blocks/cta";
export type { CtaSurface } from "./blocks/cta";
export { default as EnquirySection } from "./blocks/enquiry";
export type { EnquiryThread } from "./blocks/enquiry";
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
export {
    PACKS_ASK,
    PACKS_BUY,
    PACKS_TITLE,
    default as PacksSection,
    packEyebrow,
    packPerClass,
} from "./blocks/packs";
// Called by saroh.app's server: from a module with no "use client".
export type { PacksFeed, PublicPack } from "./blocks/packs";
export {
    PLANS_BUTTON,
    PLANS_JOIN,
    default as PlansSection,
    joinHref,
    planEvery,
    planPrice,
} from "./blocks/plans";
export { packsOf } from "./prices/pack-words";
// Called by saroh.app's server: from a module with no "use client".
export type { PlansFeed, PublicPlan } from "./blocks/plans";
export {
    PRODUCT_GRID_TITLE,
    default as ProductGridSection,
} from "./blocks/product-grid";
export { plansAutopayMethods, plansOf, plansPayOnline } from "./lib/plans-read";
// Called by saroh.app's server: from a module with no "use client".
export type { ProductGridFeed } from "./blocks/product-grid";
export { default as RichTextSection } from "./blocks/rich-text";
export { default as ServicesListSection } from "./blocks/services-list";
export type { PublicService } from "./blocks/services-list";
export { default as TestimonialsSection } from "./blocks/testimonials";
export { default as VisitUsSection, directionsHref } from "./blocks/visit-us";
export { productCardsOf, productGridQuery } from "./lib/product-grid-read";
// Server-safe (not in the "use client" block): saroh.app reads it for the
// booking page's header on the server (E6).
export { isPublicVisit } from "./lib/public-visit";
export type { PublicVisit } from "./lib/public-visit";

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
// The order confirmation page after a shop payment (P4).
export type { ShopBagProps } from "./shop/bag";
export type { BagItem } from "./shop/bag-store";
export {
    OrderConfirmation,
    orderConfirmationHref,
} from "./shop/order-confirmation";
export type {
    OrderConfirmationData,
    OrderConfirmationLine,
    OrderConfirmationLookup,
} from "./shop/order-confirmation";

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
// A full class's waitlist (A12): the site's server actions join, leave and
// read it with the session, and answer the page in the page's own terms.
export {
    isWaitlistJoined,
    isWaitlistLeft,
    isWaitlistPlaces,
} from "./booking-flow/waitlist";
export type {
    WaitlistApi,
    WaitlistJoined,
    WaitlistPlaces,
    WaitlistSession,
} from "./booking-flow/waitlist";

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
// Home, Me and Messages (A13). Data arrives from the site's server; changes go through its
// server actions.
export { AccountEntry } from "./account/account-entry";
export { AccountHome } from "./account/account-home";
export { Me } from "./account/me";
export type { DetailsResult, MeApi, MeProps, NoteResult } from "./account/me";
export { AccountMessages } from "./account/messages";
export type {
    AccountMessagesProps,
    MessagesApi,
    SendResult,
} from "./account/messages";
// A7: the Orders tab and an order's Track; A8: the Plan tab.
export type {
    Block as AccountBlock,
    AccountBooking,
    AccountClasses,
    AccountHome as AccountHomeData,
    AccountMessage,
    AccountNote,
    AccountOrder,
    AccountOrderDetail,
    AccountOrderLine,
    AccountOrderVisit,
    AccountPack,
    AccountPlan,
    AccountPlanTab,
    AccountReceipt,
    AccountSubscription,
    AccountTab,
    AccountTabKey,
    AccountThread,
    AccountTrackStep,
    AccountView,
} from "./account/model";
export { AccountOrders, ORDERS_HREF, trackHref } from "./account/orders-list";
// A6: the Bookings tab, its Move and Cancel sheets, and a class moved on the
// booking page.
export type {
    CancelResult as AccountCancelAnswer,
    MoveResult as AccountMoveAnswer,
    TimesResult as AccountTimesAnswer,
    VisitResult as AccountVisitAnswer,
    BookingsApi,
} from "./account/bookings-api";
export { AccountBookingsTab } from "./account/bookings-list";
export { BOOKINGS_HREF, moveClassHref } from "./account/bookings-model";
export type {
    AccountBookingRow,
    AccountBookingState,
    AccountBookings,
    AccountCancelResult,
    AccountCancelTerms,
    AccountTimes,
    AccountTreatment,
    AccountTreatmentVisit,
} from "./account/bookings-model";
export { MoveClass } from "./account/move-class";
export { AccountCard } from "./account/parts";
export { PlanTab } from "./account/plan-tab";
export type {
    PayNowResult,
    PlanApi,
    PlanChangeResult,
    PlanTabProps,
} from "./account/plan-tab";
// A11: buying a class pack from the Plan tab.
export { BuyPackSheet } from "./account/buy-pack-sheet";
export type {
    AccountPackAttempt,
    AccountPackCheckout,
    AccountPackOnSale,
    AccountPacksOnSale,
    PackResult,
    PacksApi,
    PlanPacksShop,
} from "./account/packs-api";
// G20: joining a plan and buying a pack from the site's Prices page.
export { ACCOUNT_TAB_HREF, AccountTabBar } from "./account/tab-bar";
// The account's compact header, and the site's chrome stepping aside for it
// (DEC-073 #10).
export {
    AccountHeader,
    SiteChromeFrame,
    accountTitle,
    businessInitial,
    isAccountPath,
} from "./account/account-header";
export type { TrackLookup } from "./account/track-sheet";
export { PRICES_OFFLINE, joinedMessage } from "./prices/api";
export type {
    JoinApi,
    JoinProblem,
    JoinResult,
    PlanJoinAttempt,
    PlanJoinStarted,
    PricesActions,
} from "./prices/api";
export { JoinSheet } from "./prices/join-sheet";
export type { JoinSheetProps, JoinablePlan } from "./prices/join-sheet";
// D12: the customer sets up autopay (the join, My plan, the pay link).
export type { AutopayStartResult } from "./account/plan-api";
export {
    AUTOPAY_METHODS,
    autopayCheckStateOf,
    autopayChecksOf,
    autopayMethodsOf,
    autopayOutcomeOf,
    autopayStartOf,
    autopayStateOf,
    isAutopayMethod,
} from "./autopay/api";
export type {
    AutopayCheck,
    AutopayCheckState,
    AutopayChecks,
    AutopayMethod,
    AutopayOutcome,
    AutopayStart,
    AutopayState,
} from "./autopay/api";
export {
    AutopayMethodChoice,
    landOnBusinessSite,
    openAutopayWindow,
} from "./autopay/choice";
export type { AutopayWindowOutcome } from "./autopay/choice";
export { AutopayDone } from "./autopay/done";
export type { AutopayDoneProps, AutopayDoneState } from "./autopay/done";
export {
    autopayCheckAfter,
    autopayCheckBefore,
    autopayCheckLine,
    autopayMethodLabel,
    autopayMethodSub,
    autopayStateLine,
    autopayWith,
} from "./autopay/words";
export { openProviderCheckout } from "./booking-flow/checkout";
export { PayOption } from "./booking-flow/steps/pay-option";

export { destructiveAlertClasses } from "./alert";
export { DEFAULT_API_URL } from "./api-url";
export { cn } from "./lib/utils";
export {
    SiteFooter,
    SiteHeader,
    footerLine,
    siteMenu,
    withShopLink,
} from "./site-chrome";
export type { ModulePageStates, SiteFooterContent } from "./site-chrome";
// A module page's address while its module is off (G15).
export { ModulePageUnavailable } from "./module-page-unavailable";
// A module page's title and lead (DEC-073 #9).
export { ModulePageTop, modulePageTopOf } from "./module-page-top";
export type { ModulePageTopContent } from "./module-page-top";
export type { SiteHeaderAction, SiteNavItem } from "./site-header-menu";
export { SiteTheme, SiteThemeScope } from "./site-theme";
