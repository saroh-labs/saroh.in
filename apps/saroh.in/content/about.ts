import { EARLY_ACCESS_DAY } from "./early-access";
import { CTA_BAND } from "./home";
import type { ModeWords, OpenOnly } from "./launch-words";
import { SAROH_NAME } from "./name";

/**
 * The day this module's words last changed, the sitemap's `lastmod` for its
 * pages (`lib/site-pages.ts`). Change it with the words:
 * `pnpm check:content-dates` fails a batch that doesn't.
 */
export const UPDATED = "2026-10-12";

/**
 * /about, from the design "Saroh Marketing Site V2 - About" (DEC-137): who
 * Saroh is for, what the name means, what we hold ourselves to, where we
 * are, who makes it and the closing band.
 *
 * Three rules shape these words, and `MARKETING_CLAIMS.md` §14 has a row
 * for every claim:
 *
 * - **Nothing about Saroh's plans, prices or limits before launch.** What
 *   names them is marked `openOnly` (a clause, a card) or has a second
 *   wording (`ModeWords`, `openBody`), and returns when the launch switch
 *   opens (`content/launch-words.ts`).
 * - **Only what the product backs.** Where the design promised more, the
 *   words here stop at what is true; the ledger says what was left out.
 * - **Company facts come from `content/company.ts`**, and a fact that isn't
 *   set there is not drawn.
 */

/** A clause of the opening paragraph. */
export interface LeadPart extends OpenOnly {
    text: string;
}

/**
 * One half of the name, as its line reads: the letters, then "**sa**, with.
 * As in सपरिवार, with the family."
 */
export interface NamePart {
    /** In Devanagari. */
    hi: string;
    /** How it is said, in Latin letters; drawn strong. */
    roman: string;
    /** What it means, up to the word that carries it. */
    means: string;
    /** A Hindi word that carries it. */
    example: string;
    /** What that word means, to the line's end. */
    gloss: string;
}

/** A card under "What we hold ourselves to". */
export interface AboutValue extends OpenOnly {
    title: string;
    body: string;
    /** The fuller words drawn once the launch switch is open. */
    openBody?: string;
}

/** The day early access opens, as a sentence writes it: "17 October 2026". */
export const EARLY_ACCESS_LONG = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
}).format(new Date(`${EARLY_ACCESS_DAY}T12:00:00+05:30`));

export const ABOUT = {
    href: "/about",
    /** The footer's name for the page. */
    name: "About",
    /** What the page is, in one line (`/llms.txt`). */
    line: "Who Saroh is for, what the name means and who makes it.",
    seo: {
        title: "About us and what the name means · Saroh",
        socialTitle: "About Saroh",
        description:
            "About Saroh, business software for small businesses in India: who it is for, what the name means and the company that makes it.",
    },

    eyebrow: "About Saroh",
    title: "Built for the owners who run everything themselves.",
    lead: [
        {
            text: "Most small businesses in India run on WhatsApp, a notebook, UPI screenshots and two or three apps that don't talk to each other. Saroh puts bookings, orders, subscriptions, payments and your website in one place",
        },
        {
            text: ", priced in rupees, with a Free plan you can really use",
            openOnly: true,
        },
        { text: "." },
    ] satisfies LeadPart[] as readonly LeadPart[],

    meaning: {
        eyebrow: "What the name means",
        word: SAROH_NAME.word,
        parts: [
            {
                hi: "स",
                roman: "sa",
                means: ", with. As in ",
                example: "सपरिवार",
                gloss: ", with the family.",
            },
            {
                hi: "आरोह",
                roman: "aaroh",
                means: ", rising. As in ",
                example: "पर्वतारोही",
                gloss: ", the one who climbs a mountain.",
            },
        ] satisfies NamePart[] as readonly NamePart[],
        together: {
            before: "Put together, Saroh means ",
            strong: "rising together",
            after: ". Nobody climbs alone, not mountains and not businesses. When the businesses on Saroh grow, we grow.",
        },
        line: SAROH_NAME.line,
    },

    values: {
        title: "What we hold ourselves to",
        cards: [
            {
                title: "One place, not six apps",
                body: "Sell, take bookings, run monthly plans, send invoices and keep your website, in one place.",
            },
            {
                title: "Made for India",
                body: "GST invoices, ₹1,25,000 written the way you write it, and payment by UPI or card.",
                openBody:
                    "Prices in rupees, GST shown both ways, ₹1,25,000 written the way you write it, and payment by UPI or card.",
            },
            {
                title: "Your money, your account",
                body: "Payments go straight to your own Razorpay or Cashfree account. Saroh never holds your money.",
            },
            {
                title: "Honest limits",
                body: "A warning at 80% of any limit, never a surprise block, and add-ons instead of forced upgrades.",
                openOnly: true,
            },
            {
                title: "Source-available",
                body: "The code is public under the Elastic License 2.0. You can read it, and you can host it yourself.",
            },
        ] satisfies AboutValue[] as readonly AboutValue[],
    },

    where: {
        eyebrow: "Where we are",
        title: `Early access, from ${EARLY_ACCESS_LONG}.`,
        /** The paragraph's first sentence: only open mode can say "live". */
        opens: {
            waitlist: `Saroh opens in early access on ${EARLY_ACCESS_LONG}.`,
            open: "Saroh is live and you can use it today.",
        } satisfies ModeWords,
        rest: "It's early, so there will be rough edges. When you tell us about one, we fix it, and we write down every change in the changelog.",
        /** Each is drawn only while its page is shown (`linkShown`). */
        links: [
            { label: "Read the changelog", href: "/changelog" },
            {
                label: "See what's coming next",
                href: "/changelog#coming-next",
            },
        ],
    },

    founder: {
        eyebrow: "A note from the founder",
        role: "Founder, Saroh",
    },

    company: {
        nameLabel: "Company",
        /** "Saroh is a product of {legal name}." */
        madeBy: (legalName: string) => `Saroh is a product of ${legalName}.`,
        officeLabel: "Registered office",
        contactLabel: "Get in touch",
        contactLink: "Contact us",
    },

    band: {
        title: {
            waitlist: "Grow with us.",
            open: "Start free. Grow with us.",
        } satisfies ModeWords,
        note: {
            waitlist:
                "We'll email you once, with your invite, when early access opens.",
            open: CTA_BAND.note,
        } satisfies ModeWords,
    },
} as const;
