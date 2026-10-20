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
export {
    PageSections,
    default as SectionRenderer,
    opensOverPhoto,
    pageProof,
    withLookVariant,
} from "./section-renderer";
export type { Section } from "./section-renderer";
// The hero's way in and its proof line under a look (DEC-172, U6).
export type { FrontDoor, PageProof } from "./blocks/look-front";
// A look's button classes, for a state page's ways on (DEC-172, U15).
export { frontButton } from "./blocks/look-front";
// The look a page is drawn in, and whether it is the owner's preview
// (DEC-172, U4): handed to every block as props.
export { lookOf, lookScope } from "./look-context";
export type { LookProps } from "./look-context";
// A business's live data given to a whole page (template renders, U14).
export type { SiteFixtures } from "./site-fixtures";
// Server-safe: which sections are known to draw nothing, for the menu.
export {
    FEED_BACKED_SECTIONS,
    sectionRendersNothing,
    withoutEmptyInPageEntries,
} from "./section-empty";
export type { FeedsFor, SectionFeeds } from "./section-empty";

export {
    BlockFixturePreview,
    SAMPLE_PLANS,
    SAMPLE_POSTS,
    SAMPLE_PRODUCTS,
    SAMPLE_SERVICES,
    SAMPLE_TIMETABLE,
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
export { default as FullBleedHero } from "./blocks/hero-full-bleed";
export {
    HOURS_TITLE,
    default as HoursSection,
    hoursRows,
} from "./blocks/hours";
export { default as PersonSection } from "./blocks/person";
export {
    TIMETABLE_TITLE,
    default as TimetableSection,
} from "./blocks/timetable";
// Server-safe: the Timetable read's shape, check and words.
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
export {
    dayLabel,
    isPublicTimetable,
    placesWord,
    sessionHref,
    timetableQuery,
} from "./lib/timetable-read";
export type { PublicTimetable, TimetableSession } from "./lib/timetable-read";
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
export { PROJECTS_LINK, default as ProjectsSection } from "./blocks/projects";
export {
    plansAutopayMethods,
    plansNotTakingOrders,
    plansOf,
    plansPauseWeeks,
    plansPayOnline,
} from "./lib/plans-read";
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
export {
    NO_CONTACT,
    hasContact,
    isSocialLink,
    publicContactOf,
} from "./lib/public-contact";
export type {
    PublicContact,
    PublicContactPlace,
    PublicSocialLink,
} from "./lib/public-contact";
// A business's social links as icons, and the footer's contact group
// (DEC-128).
export { isPublicVisit } from "./lib/public-visit";
export type { PublicVisit } from "./lib/public-visit";
export { addressDirectionsHref, shownContact } from "./site-footer-contact";
export { SocialIcon, SocialLinkRow } from "./social-icons";

// The one rule for "Open now" (G8): Visit us, the hero's On today (G18) and
// the booking page's header (E6) all say it through this.
export {
    FALLBACK_TIME_ZONE,
    clockText,
    isOpeningWeek,
    openState,
    openStateText,
    weekSummary,
    weekdayIn,
} from "./lib/opening-hours";
export type { OpenState, OpeningHoursDay, Weekday } from "./lib/opening-hours";

// A price as the site shows it; no directive, so server pages can call it.
export { formatAmount } from "./lib/money";
// The GST words beside a price, one way on every page; the API's numbers.
export {
    browsePriceWords,
    gstLineWords,
    gstNoteWords,
    gstOnPriceOf,
    gstPayWords,
    gstPriceWords,
    gstUnderWords,
    isGstOnPrice,
    payPriceWords,
    startOfLine,
} from "./lib/gst-price";
export type { GstOnPrice } from "./lib/gst-price";
export { isMrpSaving, shownSaving } from "./lib/mrp-saving";
export type { MrpSaving } from "./lib/mrp-saving";
// A business's public phone as a visitor reads it (DEC-053).
export { phoneText } from "./lib/phone";
export { shopFactsLine, shopLeadLine } from "./lib/shop-facts";
export type { ShopFactsInput, ShopLeadInput } from "./lib/shop-facts";
export { siteImage } from "./lib/site-image";
export type { ImagePlace, SiteImageProps } from "./lib/site-image";
export { emailed, reachOrNull, toldText } from "./lib/told";
export type { NoticeReach } from "./lib/told";
export { NO_REACH, ReachLinks, hasReach, reachOf } from "./reach-links";
export type { BusinessReach } from "./reach-links";

// Not a page block: a product as its shop page shows it (#465) — the
// workspace's Customer view today, the storefront product page later.
export {
    default as ProductPage,
    percentOff,
    productSaving,
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
// The shop under a look (DEC-172, U11, #1102). Classic keeps the above.
export { pickupReadyWords } from "./lib/shop-facts";
export { LookShopListing } from "./product/shop-listing-look";
export { SHOP_OFFLINE } from "./shop/api";
export type {
    CheckoutQuote,
    CheckoutStanding,
    CheckoutStarted,
    DeliveryAddress,
    QuoteDiscount,
    QuoteFreeDelivery,
    QuoteLine,
    QuotePayment,
    QuoteWay,
    ShopCheckoutApi,
    ShopPayment,
    ShopProblem,
    ShopResult,
    ShopWay,
    StartCheckout,
} from "./shop/api";
export { AskAboutOrdering, askAboutHref } from "./shop/ask-about-ordering";
export { ShopBag } from "./shop/bag";
export { LookAddToBag } from "./shop/look-add-to-bag";
export { LookCheckout } from "./shop/look-checkout";
export { LookOrderPlaced } from "./shop/look-placed";
export {
    NOT_TAKING_ORDERS_TEXT,
    NotTakingOrders,
} from "./shop/not-taking-orders";
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
// The booking step in the address (site templates v2 U9).
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
export {
    BOOKING_STEPS,
    closeHref,
    parseStepUrl,
    resolveStep,
    serializeStepUrl,
} from "./booking-flow/step-url";
export type { BookingStep, StepUrl } from "./booking-flow/step-url";
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

// Not a page block: "How to pay us" (R32) on a customer's own unpaid
// invoice, order or booking — the business's UPI ID as a QR, its bank
// details and note, as the API sent them with that record.
export {
    hasPayInstructions,
    payInstructionsOf,
    payWaysText,
    upiPayUri,
} from "./pay-instructions/model";
export type { PayInstructions } from "./pay-instructions/model";
export { PayInstructionsCard } from "./pay-instructions/pay-instructions";
export type { PayInstructionsCardProps } from "./pay-instructions/pay-instructions";

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
export { AccountOrders } from "./account/orders-list";
// From the plain module: a server page reads these as values, which a
// constant exported from a client file never is.
export { ACCOUNT_TAB_HREF, ORDERS_HREF, trackHref } from "./account/hrefs";
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
    AccountBookingPaid,
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
export { AccountTabBar } from "./account/tab-bar";
// The account in a look (DEC-172, plan U12).
export { AccountLookFrame } from "./account/look-account";
export {
    ACCOUNTS_OFF_TEXT,
    greetingWords,
    lookTabLabel,
} from "./account/look-account-words";
export { LookSignIn } from "./account/look-sign-in";
export { SignInOpener } from "./account/sign-in-return";
export { orderStatusWords } from "./account/status-words";
// The account's compact header, and the site's chrome stepping aside for it
// (DEC-073 #10).
export {
    AccountHeader,
    SiteChromeFrame,
    accountTitle,
    businessInitial,
    isAccountPath,
} from "./account/account-header";
export type { TrackLookup } from "./account/order-track";
// DEC-142: the rest of what a customer sees, and each thing's own page.
export { AccountLoading } from "./account/account-loading";
export type { AccountLoadingShape } from "./account/account-loading";
export { AccountBookingPage } from "./account/booking-page";
export type { BookingLookup } from "./account/booking-page";
export { DataRequestCard } from "./account/data-request";
export type {
    AccountDataRequest,
    AskDataRequest,
    DataRequestResult,
} from "./account/data-request";
export { DETAILS_OFFLINE } from "./account/details-api";
export type {
    LeaveLine,
    LeaveResult,
    NoticesResult,
    PayInvoice,
    SaveNotices,
} from "./account/details-api";
export { TO_PAY_HREF, bookingHref, orderHref } from "./account/details-model";
export type {
    AccountChange,
    AccountCourse,
    AccountInvoiceDue,
    AccountNotices,
    AccountWaitlistPlace,
} from "./account/details-model";
export { AccountOrderPage } from "./account/order-page";
export { BackLink } from "./account/parts";
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
export type { OpenCheckout } from "./booking-flow/checkout";
export { PayOption } from "./booking-flow/steps/pay-option";
// Paying from a pay link (an invoice's, an order's): the Pay button, the
// provider's window and where the payment stands.
export {
    PayLinkHelp,
    PayLinkPay,
    PayLinkStatus,
    payLinkButtonLabel,
    usePayLink,
} from "./pay-link/pay-link-pay";
export type {
    PayLinkContact,
    PayLinkOptions,
    PayLinkStart,
    PayLinkState,
} from "./pay-link/pay-link-pay";

export { destructiveAlertClasses } from "./alert";
export { DEFAULT_API_URL } from "./api-url";
export { cn } from "./lib/utils";
export {
    FOOTER_LAYOUTS,
    SiteFooter,
    SiteHeader,
    footerLine,
    madeWithSarohHref,
    siteMenu,
    siteMenuEntries,
    withShopLink,
} from "./site-chrome";
export type {
    FooterLayout,
    ModulePageStates,
    SiteContact,
    SiteContactPlace,
    SiteCredit,
    SiteFooterContent,
    SiteHeaderLogo,
    SiteSession,
} from "./site-chrome";
// A look's chrome (DEC-172, U5): the one fixed bar on a phone and Live's
// dock, mounted by the site's layout under a look.
export { dockTabs, withVisitUs } from "./look-chrome";
export type { DockTab } from "./look-chrome";
export { StickyActions } from "./sticky-actions";
// The one thing a site asks of a visitor: the header's main button, and
// what a template's hero and closing band agree with. Pure.
export {
    SITE_PRIMARY_ACTIONS,
    SITE_PRIMARY_ORDER,
    chromeActionShows,
    chromePageKind,
    contactPageHref,
    opensPrimaryAction,
    sitePrimaryAction,
    withoutPrimaryAction,
} from "./site-primary-action";
export type { SitePrimaryAction, SitePrimaryKind } from "./site-primary-action";
// A page of the site's own that holds no block (not found, an error).
export { SitePageMessage } from "./site-page-message";
// The closing band's words when its content gives none. Pure.
export { ctaBandWords } from "./blocks/cta-words";
export type { CtaBandWords } from "./blocks/cta-words";
// Who a customer is buying from, in the business's own details (DEC-121).
export {
    SoldByBlock,
    SoldByLine,
    reportBusinessHref,
    sellerLead,
    soldByLine,
} from "./sold-by";
export type { SellerLead, SiteSeller } from "./sold-by";
// A module page's address while its module is off (G15).
export { ModulePageUnavailable } from "./module-page-unavailable";
// A module page's title and lead (DEC-073 #9).
export { ModulePageTop, modulePageTopOf } from "./module-page-top";
export type { ModulePageTopContent } from "./module-page-top";
export type { SiteHeaderAction, SiteNavItem } from "./site-header-menu";
export { SiteTheme, SiteThemeScope, fontPairStacks } from "./site-theme";
export type { LoadedSiteFaces } from "./site-theme";
// The typeface pairs (KTD-2), for the renderer's loader and the Style panel.
export {
    FONT_PAIRS,
    PICKABLE_FONT_PAIRS,
    findFontPair,
    fontFaceKey,
    fontPairFaceKeys,
    fontPairFamilies,
    isFontPairKey,
} from "@saroh/block-contract";
export type {
    FontPairKey,
    SiteFontFace,
    SiteFontPair,
} from "@saroh/block-contract";

// A test release (DEC-071, T6): the layout's provider, the hook the flows
// read, the stop they show instead of taking a real order, booking,
// payment or enquiry, and the words the site's server actions refuse in.
export { TestReleaseProvider, useTestRelease } from "./test-release/context";
export type { TestReleaseInfo } from "./test-release/context";
export {
    TestReleaseStop,
    TestReleaseStopSheet,
} from "./test-release/test-release-stop";
export type { TestReleaseVerb } from "./test-release/test-release-stop";
// Server-safe: the site's server actions refuse in these words.
export {
    ConsentBanner,
    CookieChoicesButton,
    listOf,
    lookConsentWords,
} from "./consent-banner";
// Where a look's banner docks, so it never covers the hero's buttons (U15).
export { consentDock, heroTargets } from "./consent-dock";
export { SITE_CONSENT_OFFSET, SITE_CONSENT_OPEN_EVENT } from "./consent-events";
export { CookieNotice } from "./cookie-notice";
export {
    SIGN_IN_OFF_TEXT,
    TEST_RELEASE_CODE,
    TEST_RELEASE_MESSAGE,
    TEST_RELEASE_REASON,
    TEST_RELEASE_REFUSAL,
    isTestReleaseRefusal,
    itemsText,
} from "./test-release/words";
export type { TestReleaseRefusal } from "./test-release/words";
