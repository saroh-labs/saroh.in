import { CTA_BAND } from "./home";

/** /about: saroh.in's page, with what's true outside India. A fact not set here isn't drawn. */
export const ABOUT = {
    eyebrow: "About Saroh",
    title: "Built for the owners who run everything themselves.",
    lead: "A lot of small businesses run on a notebook, a few spreadsheets and two or three apps that don't talk to each other. Saroh puts your products, orders, bookings, invoices and website in one place.",
    meaning: {
        eyebrow: "What the name means",
        word: "सारोह",
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
        ],
        together: {
            before: "Put together, Saroh means ",
            strong: "rising together",
            after: ". Nobody climbs alone, not mountains and not businesses. When the businesses on Saroh grow, we grow.",
        },
        line: "Let's rise together.",
    },
    values: {
        title: "What we hold ourselves to",
        cards: [
            {
                title: "One place, not six apps",
                body: "Sell, take bookings, write invoices and keep your website, in one place.",
            },
            {
                title: "Made for where you are",
                body: "Set up your business in your country, in one of nine currencies.",
            },
            {
                title: "Your money stays yours",
                body: "Saroh doesn't hold what your customers pay you. You take it yourself and record it.",
            },
            {
                title: "Source-available",
                body: "The code is public under the Elastic License 2.0. You can read it, and you can host it yourself.",
            },
        ],
    },
    where: {
        eyebrow: "Where we are",
        title: "Early days.",
        body: "It's early, so there will be rough edges. Tell us about one and we'll look at it. The changelog says what has changed.",
        links: [
            { label: "Read the changelog", href: "/changelog" },
            { label: "See what isn't built yet", href: "/integrations" },
        ],
    },
    company: {
        nameLabel: "Company",
        madeBy: (legalName: string) => `Saroh is a product of ${legalName}.`,
        contactLabel: "Get in touch",
        contactLink: "Contact us",
    },
    band: {
        title: "Start free. Grow with us.",
        note: CTA_BAND.note,
    },
} as const;
