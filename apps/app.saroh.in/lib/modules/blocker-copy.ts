/**
 * What a merchant reads for each of the API's module codes (DEC-057: a raw
 * code is never rendered to a merchant).
 *
 * The API sends a sentence with every readiness step, turn-off refusal and
 * turn-off line; the gate codes (who, rollout, installed, project, plan)
 * come without one. `blockerSentence` is the only way the app turns a
 * blocker into words: the API's sentence when it sent one, else this map's,
 * else a plain line — never the code. `blocker-copy.test.ts` reads the
 * API's capabilities module and fails when a code it can send has no line
 * here, and scans the app for a code rendered directly.
 */
export const BLOCKER_COPY: Readonly<Record<string, string>> = {
    // The gates, in the API's order.
    UNAUTHORIZED:
        "Your role doesn't include this. An owner or admin can change what you can reach.",
    ROLLOUT_DISABLED: "This isn't available for your business yet.",
    ORG_MODULE_DISABLED:
        "This is turned off for your business. Nothing it holds has been deleted.",
    PROJECT_MODULE_UNSELECTED: "This isn't turned on for this project.",
    ENTITLEMENT_REQUIRED:
        "Your plan doesn't include this. Change plan in Settings › Plan and billing.",

    // Readiness: setup still to do, or something that stopped working.
    WEBSITE_NO_SITE: "Create a site to get started.",
    WEBSITE_NO_PUBLICATION: "Publish your site to go live.",
    WEBSITE_SHOP_NOT_CHOSEN:
        "Choose which storefront your site sells from. Until then your shop page isn't live.",
    CRM_NO_PIPELINE: "Create a pipeline to start tracking leads.",
    APPOINTMENTS_NO_SERVICE: "Add a bookable service.",
    APPOINTMENTS_NO_AVAILABILITY:
        "Set your availability so customers can book.",
    COURSES_NO_COURSE: "Make a course to start taking enrolments.",
    COURSES_NONE_OPEN: "Open a course to take enrolments.",
    CLASS_PACKS_NO_PACK: "Make a pack to start selling them.",
    CLASS_PACKS_NONE_ON_SALE:
        "Every pack is archived. Restore one or make a new one to sell.",
    COMMERCE_NO_CATALOG: "Add a product to start selling.",
    PAYMENTS_NO_PROVIDER: "Connect a payment provider to accept payments.",
    PAYMENTS_PROVIDER_DISABLED:
        "A connected provider is switched off. Switch it back on to take payments.",
    PAYMENTS_WEBHOOK_SECRET_MISSING:
        "Payments can't be confirmed. Add the webhook signing secret to your payment provider's connection.",
    COMMUNICATIONS_NO_PROVIDER: "Connect a provider to send messages.",
    COMMUNICATIONS_PROVIDER_DISABLED:
        "A connected provider is switched off. Switch it back on to send messages.",
    AUTOMATIONS_NO_RULE: "Create a rule to automate follow-up.",
    INSIGHTS_NO_DATA: "Figures appear once there's activity to count.",

    // What refuses a turn-off.
    COMMERCE_OPEN_ORDERS:
        "Some open orders need sending or cancelling first. Orders already placed stay in Orders.",

    // What turning a module off changes (F13).
    APPOINTMENTS_UPCOMING_BOOKINGS:
        "Upcoming bookings stay booked; the booking page stops taking new ones.",
    APPOINTMENTS_SITE_BOOK_PAGE:
        "Your site's booking page stops taking bookings.",
    APPOINTMENTS_ACCOUNT_TAB:
        "Bookings leave your customers' accounts on your site.",
    COURSES_ENROLMENTS: "People already enrolled keep their places.",
    CLASS_PACKS_CREDITS_LEFT: "Visits left on packs already sold are kept.",
    PAYMENTS_LIVE_SUBSCRIPTIONS: "Live subscriptions stop renewing.",
    PAYMENTS_AUTOPAY: "Autopay stops charging.",
    PAYMENTS_UNPAID_INVOICES: "Unpaid invoices stay as they are.",
    PAYMENTS_SITE_PLANS: "Your site stops selling plans.",
    COMMERCE_STOREFRONTS: "Your storefronts stop taking orders.",
    COMMERCE_PUBLISHED_PRODUCTS:
        "Products leave your site; they are kept here.",
    COMMERCE_SITE_SHOP: "Your site's shop closes.",
    COMMERCE_SITE_SHOP_PAGE: "Your site's shop page stops selling.",
    COMMERCE_ACCOUNT_TAB: "Orders leave your customers' accounts on your site.",
    WEBSITE_LIVE_SITES: "Your live sites go offline.",
};

/** Said for a code this app doesn't know yet: true, and never the code. */
export const BLOCKER_FALLBACK = "This needs attention before it can go ahead.";

/**
 * The words for one blocker: the API's own sentence, else this app's line
 * for its code, else the plain fallback. Never the code.
 */
export function blockerSentence(blocker: {
    code: string;
    message?: string | null;
}): string {
    const said = blocker.message?.trim();
    if (said) return said;
    return BLOCKER_COPY[blocker.code] ?? BLOCKER_FALLBACK;
}
