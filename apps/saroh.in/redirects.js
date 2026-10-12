/**
 * Every old address on saroh.in and the page that now answers it (plan U26).
 *
 * Old addresses may be bookmarked, shared or indexed, so each lands on its V2
 * page in ONE hop: no destination here is itself a source (`redirects.test.ts`
 * checks that, and that every destination is a page the site serves). 301,
 * as the plan asks, rather than Next's default 308 for `permanent`.
 *
 * - V1 (the "Saroh Marketing Site" pages, removed in U26): the five job pages,
 *   How it works and Coming soon. `/website` goes to the Website feature
 *   page (it went Home until that page was built, 12 Oct 2026); Coming
 *   soon's "what's planned" is the waitlist's ask.
 * - Before V1: `/modules`, `/modules/<slug>` and `/what-it-will-not-do`,
 *   repointed straight to where their V1 page now goes. Payments and
 *   messages had no page of their own: they lived on Sell and Contacts, so
 *   they follow those. Automations went to Coming soon, so it follows it to
 *   the waitlist; What it will not do goes Home. `/about` went Home too
 *   until the About page came back at its own address (DEC-137).
 *
 * `/pricing` is not published until the site's launch switch opens
 * (`NEXT_PUBLIC_LAUNCH_MODE=open`, plan KTD-16; Gate W kept it unpublished),
 * so until then it is a temporary (302) redirect to the waitlist, from
 * `temporary()`: a browser or search engine must not remember it, because
 * Pricing comes back at its own address. `next.config.js` passes the switch
 * in at build, as it reads it.
 *
 * `/waitlist` is the other way round. While the site is in waitlist mode it
 * is a page. Once the switch is open nobody joins a list any more, so the
 * address moves for good (301) to sign-up on accounts, the place every
 * "Start free" button goes (`SIGN_UP_URL` in `lib/links.ts`;
 * `redirects.test.ts` keeps the two the same). Next carries the query over,
 * so an old link's `?plan=` and `?src=` reach sign-up. Open the site only
 * after accounts' prelaunch gate is off: while that gate is on it sends a
 * visitor without the key back to `/waitlist`, and the two would go round
 * (`docs/architecture/runbooks/LAUNCH_DAY_17_OCT.md`).
 */

/** @typedef {{ source: string; destination: string; statusCode: 301 | 302 }} Redirect */

/** V1 job slug → its V2 page. */
const V1_JOBS = {
    sell: "/features/orders",
    website: "/features/website",
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
    moved("/what-it-will-not-do", "/"),
];

/** Pages not published yet: temporary, so nothing caches them. */
/** @type {Redirect[]} */
/**
 * The temporary redirects for the site's launch mode: Pricing to the
 * waitlist until the switch is "open".
 *
 * @param {string | undefined} launchMode `NEXT_PUBLIC_LAUNCH_MODE`
 * @returns {Redirect[]}
 */
const temporary = (launchMode) =>
    launchMode === "open"
        ? []
        : [{ source: "/pricing", destination: "/waitlist", statusCode: 302 }];

/** Where accounts is when `NEXT_PUBLIC_ACCOUNTS_URL` is unset, as in `lib/links.ts`. */
const ACCOUNTS_URL = "https://accounts.saroh.in";

/**
 * What the open launch mode moves for good: the waitlist's address, to
 * sign-up. Nothing in any other mode.
 *
 * @param {string | undefined} launchMode `NEXT_PUBLIC_LAUNCH_MODE`
 * @param {string | undefined} [accountsUrl] `NEXT_PUBLIC_ACCOUNTS_URL`
 * @returns {{ source: string; destination: string; statusCode: 301 }[]}
 */
const launched = (launchMode, accountsUrl) =>
    launchMode === "open"
        ? [
              {
                  source: "/waitlist",
                  destination: `${accountsUrl ?? ACCOUNTS_URL}/signup`,
                  statusCode: 301,
              },
          ]
        : [];

module.exports = { REDIRECTS, temporary, launched };
