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
    planLimits: "[confirm: plan limits]",
    referralRules: "[confirm: referral rules and the founding member extra]",
    competitorFacts: "[confirm: facts with links and dates]",
    indiaPaths:
        "[confirm: saroh.in paths in hreflang.json against the live site]",
    taxRates: "[confirm: tax rates in the presets]",
    customerQuote: "[confirm: a real customer quote]",
    guideAuthor: "[confirm: guide author and dates]",
    changelog: "[confirm: real changelog entries]",
    founders: "[confirm: founders' names and photos]",
    supportEmail: "[confirm: support address]",
} as const;
