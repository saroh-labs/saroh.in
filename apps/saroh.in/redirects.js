/**
 * Every old address on saroh.in and the page that now answers it (plan U26).
 *
 * Old addresses may be bookmarked, shared or indexed, so each lands on its V2
 * page in ONE hop: no destination here is itself a source (`redirects.test.ts`
 * checks that, and that every destination is a page the site serves). 301,
 * as the plan asks, rather than Next's default 308 for `permanent`.
 *
 * - V1 (the "Saroh Marketing Site" pages, removed in U26): the five job pages,
 *   How it works and Coming soon. There is no V2 Website page, so `/website`
 *   goes Home; Coming soon's "what's planned" is the waitlist's ask.
 * - Before V1: `/modules`, `/modules/<slug>`, `/about` and
 *   `/what-it-will-not-do`, repointed straight to where their V1 page now
 *   goes. Payments and messages had no page of their own: they lived on Sell
 *   and Contacts, so they follow those. Automations went to Coming soon, so
 *   it follows it to the waitlist; What it will not do goes Home.
 *
 * `/pricing` is not published yet (Gate W), so it is a TEMPORARY (302)
 * redirect to the waitlist, in `TEMPORARY`: a browser or search engine must
 * not remember it, because Pricing comes back at its own address.
 */

/** @typedef {{ source: string; destination: string; statusCode: 301 | 302 }} Redirect */

/** V1 job slug → its V2 page. */
const V1_JOBS = {
    sell: "/features/orders",
    website: "/",
    bookings: "/features/bookings",
    contacts: "/features/customers",
    insights: "/features/insights",
};

/** Pre-V1 module slug → the V1 job it pointed at. */
const MODULE_JOB = {
    website: "website",
    commerce: "sell",
    appointments: "bookings",
    crm: "contacts",
    insights: "insights",
    payments: "sell",
    communications: "contacts",
};

/** @param {string} source @param {string} destination @returns {Redirect} */
const moved = (source, destination) => ({
    source,
    destination,
    statusCode: 301,
});

/** @type {Redirect[]} */
const REDIRECTS = [
    ...Object.entries(V1_JOBS).map(([job, to]) => moved(`/${job}`, to)),
    moved("/how-it-works", "/"),
    moved("/coming-soon", "/waitlist"),
    moved("/modules", "/"),
    ...Object.entries(MODULE_JOB).map(([slug, job]) =>
        moved(
            `/modules/${slug}`,
            V1_JOBS[/** @type {keyof typeof V1_JOBS} */ (job)],
        ),
    ),
    moved("/modules/automations", "/waitlist"),
    moved("/modules/:slug", "/"),
    moved("/about", "/"),
    moved("/what-it-will-not-do", "/"),
];

/** Pages not published yet: temporary, so nothing caches them. */
/** @type {Redirect[]} */
const TEMPORARY = [
    { source: "/pricing", destination: "/waitlist", statusCode: 302 },
];

module.exports = { REDIRECTS, TEMPORARY };
