/**
 * Where help lives, in one place.
 *
 * Two reasons this is a module rather than a string typed at each call site.
 *
 * The audit's Help and Documentation finding scored 1/10 not because writing an
 * article is hard but because nothing in the product pointed at one. Links added
 * ad hoc across a dozen screens drift the moment a page is renamed, and a help
 * link that 404s is worse than none — it teaches a stuck merchant that asking
 * for help does not work.
 *
 * `pnpm check:routes` cannot help here: these are absolute URLs to a different
 * app, so nothing verifies them at build time. Keeping every topic in this table
 * at least makes the set reviewable in one screenful; `links.test.ts` checks the
 * old slugs against `apps/help.saroh.in/content/` and the new articles against
 * `apps/saroh.in/content/help/`.
 *
 * Help moves from help.saroh.in to saroh.in/help when Help publishes there
 * (17 Oct, 00:00 in India; Resources plan U5). Before that the new articles are
 * a 404 on saroh.in, so every link is worked out at the moment it is used:
 * the old site until then, the new articles from then on, with no deploy on
 * the day. help.saroh.in redirects too, so a link opened in a tab left over
 * from before still lands somewhere real.
 */
export const HELP_URL = "https://help.saroh.in";

/**
 * The marketing site, where Help lives from 17 Oct. `www`, as saroh.in
 * redirects to it (and help.saroh.in sends people there).
 */
export const MARKETING_URL = "https://www.saroh.in";

/** Help's `publishOn` on saroh.in (`content/help.ts`); the test keeps them equal. */
export const HELP_MOVES_ON = "2026-10-17";

/** Midnight in India on the day: India keeps no daylight saving, so +05:30. */
export const HELP_MOVES_AT = new Date(`${HELP_MOVES_ON}T00:00:00+05:30`);

/** Whether Help has moved to saroh.in at `now`. */
export function helpHasMoved(now: Date = new Date()): boolean {
    return now.getTime() >= HELP_MOVES_AT.getTime();
}

/**
 * Article slugs on the old site, checked against
 * `apps/help.saroh.in/content/*.mdx`.
 *
 * Named rather than free strings so a typo is a type error instead of a 404
 * someone finds while already frustrated.
 */
export const HELP_TOPICS = {
    gettingStarted: "getting-started",
    findingYourWay: "finding-your-way-around",
    customers: "customers",
    selling: "selling",
    bookings: "bookings",
    website: "website",
    organisation: "organisation",
    capabilities: "what-your-business-needs",
} as const;

export type HelpTopic = (typeof HELP_TOPICS)[keyof typeof HELP_TOPICS];

/**
 * The articles on saroh.in/help, in the order the command menu lists them,
 * checked against `apps/saroh.in/content/help/*.mdx` (slug and title).
 */
export const HELP_ARTICLES = [
    { slug: "create-your-business", title: "Create your business" },
    { slug: "add-your-first-product", title: "Add your first product" },
    { slug: "add-sizes-and-options", title: "Add sizes and options" },
    { slug: "count-and-move-stock", title: "Count and move stock" },
    { slug: "take-your-first-order", title: "Take your first order" },
    { slug: "set-your-teams-hours", title: "Set your team's hours" },
    {
        slug: "take-a-deposit-when-they-book",
        title: "Take a deposit when they book",
    },
    { slug: "set-up-a-monthly-plan", title: "Set up a monthly plan" },
    { slug: "connect-razorpay", title: "Connect Razorpay" },
    { slug: "connect-cashfree", title: "Connect Cashfree" },
    { slug: "add-your-gstin", title: "Add your GSTIN" },
    { slug: "connect-your-own-domain", title: "Connect your own domain" },
    {
        slug: "make-your-link-look-right-when-shared",
        title: "Make your link look right when shared",
    },
] as const;

export type HelpArticle = (typeof HELP_ARTICLES)[number]["slug"];

/**
 * Where each old topic goes once Help has moved: the new article that
 * answers it, or null for the Help home where no one article does (those
 * old pages covered several jobs).
 */
export const TOPIC_ARTICLE: Record<HelpTopic, HelpArticle | null> = {
    "getting-started": "create-your-business",
    "finding-your-way-around": null,
    customers: null,
    selling: "add-your-first-product",
    bookings: "set-your-teams-hours",
    website: "connect-your-own-domain",
    organisation: null,
    "what-your-business-needs": null,
};

/** The help home: the old site until Help moves, saroh.in/help after. */
export function helpHomeUrl(now: Date = new Date()): string {
    return helpHasMoved(now) ? `${MARKETING_URL}/help` : HELP_URL;
}

/** A new article on saroh.in/help. Only meaningful once Help has moved. */
export function helpArticleUrl(slug: HelpArticle): string {
    return `${MARKETING_URL}/help/${slug}`;
}

/**
 * `HelpTopic` only — deliberately not `HelpTopic | string`, which collapses to
 * `string` and throws away the whole point of naming the slugs.
 */
export function helpUrl(topic: HelpTopic, now: Date = new Date()): string {
    if (!helpHasMoved(now)) return `${HELP_URL}/${topic}`;
    const article = TOPIC_ARTICLE[topic];
    return article ? helpArticleUrl(article) : helpHomeUrl(now);
}

/** Developer documentation — a different audience and a different site. */
export const DOCS_URL = "https://docs.saroh.in";
