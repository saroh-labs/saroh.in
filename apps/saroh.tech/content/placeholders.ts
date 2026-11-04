/**
 * Every fact the boards mark [confirm], "verify" or "Example", in one file. A
 * value here is not a claim yet: the owner confirms it before launch.
 */
export const placeholders = {
    /** Search terms on the page specs: all unverified in a keyword tool. */
    searchTermsChecked: false,
    /** USD plans and limits: from the new USD catalogue, phase 3. */
    prices: "[confirm: USD catalogue; until then the plans saroh.in reads]",
    /** Board words held out of this public repo until launch. */
    pricePromise:
        "[confirm: the pricing promise line on tool bands, /pricing and home]",
    referralOffer: "[confirm: the referral offer's headline]",
    /** The boards leave most questions closed: these answers were written for them. */
    toolAnswers:
        "[confirm: the tool pages' question answers in content/tools.tsx]",
    /** Written for the sample pages; a person reads each before `reviewed: true`. */
    templateAnswers:
        "[confirm: the tips and answers in content/templates, and the UK facts' sources]",
    planLimits: "[confirm: plan limits]",
    firstMonthOffer: "[confirm: the first-month offer on /pricing and home]",
    yearlyPrices: "[confirm: yearly billing, its toggle and its maths]",
    priceCurrencyLine: "[confirm: /pricing's currency and sales tax line]",
    pricingAnswers:
        "[confirm: /pricing's answers on the first month, changing plans, refunds]",
    homeAnswers:
        "[confirm: home's answers on client accounts, currencies, CSV import, export]",
    referralRules: "[confirm: referral rules and the founding member extra]",
    competitorFacts: "[confirm: facts with links and dates]",
    /** Not in the agreed list of what Saroh's column may say yet: phone app, leaving with your data. */
    sarohCompareRows: "[confirm: Saroh's phone app and data export lines]",
    /** Unsourced: why people leave invoice apps, and that other apps export a CSV. */
    compareMarketClaims: "[confirm: why people look around, with a source]",
    indiaPaths:
        "[confirm: saroh.in paths in hreflang.json against the live site]",
    taxRates: "[confirm: tax rates in the presets]",
    customerQuote: "[confirm: a real customer quote]",
    guideAuthor: "[confirm: guide author and dates]",
    changelog: "[confirm: real changelog entries]",
    founders: "[confirm: founders' names and photos]",
    supportEmail: "[confirm: support address]",
    /** Help articles and legal pages describe an app that isn't built yet. */
    appSteps: "[confirm against the app]",
    helpDeepLinks: "[confirm: this link against the app's real addresses]",
    companyDetails: "[confirm: registered address and number]",
    legalUpdated: "[confirm: date]",
    dataLocation: "[confirm: country or region]",
    processors: "[confirm: names of the services]",
    dataAfterCancel:
        "[confirm: how long we keep your data after you cancel or leave]",
    liability: "[confirm: liability wording, from a lawyer]",
    governingLaw: "[confirm: governing law and courts]",
    postHogIp: "[confirm: IP recording is off in the PostHog project]",
    cloudflareCookie: "[confirm: Cloudflare's cookie settings on this zone]",
    cloudflareLogs: "[confirm: how long, and what Worker logs hold]",
} as const;
