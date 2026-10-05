import type { FaqItem } from "./types";

/**
 * The link preview tool's words (resources plan U2; design "Saroh Resources
 * - Link Preview Tool", the email version). Every claim here is what the
 * API does (`apps/api.saroh.in/src/modules/link-preview`) and what the
 * Privacy page says about the email.
 */
export const linkPreview = {
    path: "/tools/link-preview",
    title: "Link preview checker",
    metaTitle:
        "Link preview checker: see your link on WhatsApp, Facebook and Google · Saroh",
    socialTitle: "How does your link look when it's shared?",
    metaDescription:
        "Free link preview checker. Paste an address and see the card WhatsApp, Facebook, LinkedIn, X, Slack and Google draw for it, with what to fix.",
    apps: "WhatsApp · Facebook · LinkedIn · X · Slack · Google. Free.",
    /** The definition search engines and answer engines quote (plan U7). */
    definition:
        "A free check of how your link looks when you share it: paste a web address and see the card each app draws from the page's title, description and picture, and what to change so it looks right everywhere.",

    placeholder: "yourbusiness.in",
    submit: "Check link",
    examplesLead: "Not sure? Try one:",
    examples: [
        { label: "A sample bakery site", address: "example-bakery.in" },
        { label: "saroh.in", address: "saroh.in" },
    ],
    examplesNote:
        "Paste any address: yours, a competitor's, or the person who built your site. We only read the page's public tags.",
    loading: (domain: string) =>
        `Reading ${domain} the way WhatsApp, Facebook and Google do…`,

    gridNote:
        "Close to what each app shows today. Apps change their cards from time to time.",
    sampleNote:
        "This one is a sample, drawn from fixed tags: nothing was fetched.",
    checkAgain: "Check again",
    copyLink: "Copy link to this report",
    copied: "Link copied",
    copyFailed: "Couldn't copy. The address is in your browser's bar.",
    looksRight: "Looks right",
    needsFix: "Needs a fix",
    locked: "locked",

    lockedTitle: "Unlock the fix-it report",
    lockedBody:
        "What's wrong, the right sizes and the tags to copy. Plus Telegram, Discord, iMessage and Pinterest.",
    emailPlaceholder: "you@yourbusiness.in",
    unlock: "Unlock",
    unlocking: "Unlocking…",
    promise:
        "We'll show it here and email you a copy. Nothing else unless you ask.",
    privacy: "Privacy",
    badEmail: "That email doesn't look right. Check it and try again.",
    unlockFailed:
        "We couldn't unlock the report just now. Try again in a minute.",
    fixTitle: (m: number) =>
        m === 0
            ? "Nothing to fix"
            : `Fix ${m === 1 ? "this one" : `these ${m}`}`,
    emailed: {
        sent: "We've emailed you a copy.",
        limited:
            "We've sent this address a few reports today, so this one is only here.",
        "not-sent": "We couldn't email a copy just now. Everything is here.",
    },
    tagsTitle: "The tags to copy into your page's <head>",

    notes: [
        {
            t: "What it reads",
            b: "The Open Graph and X tags in your page: title, description, image and card type.",
        },
        {
            t: "The right picture",
            b: "1200 × 630 pixels, under 300 KB, works on all six.",
        },
        {
            t: "Old previews",
            b: "Apps keep old cards for a while. Facebook's and LinkedIn's own tools can refresh them.",
        },
    ],

    saroh: {
        title: "Saroh sites get this right automatically.",
        // The design says "Share preview"; the setting is named "Social share
        // image" in the app (site-settings.tsx), so the path says that.
        body: "Website › Settings › Social share image. Each page gets its own card, with a warning when the picture is too small.",
        path: "Website › Settings › Social share image",
        titleField: "Fresh bread every morning | Example Bakery",
        imageField: "cover.jpg · 1200 × 630",
        rightSize: "✓ Right size",
        card: {
            title: "Fresh bread every morning | Example Bakery",
            description: "Sourdough and pastries from Hill Road, out by ten.",
            domain: "example-bakery.in",
        },
    },

    faq: [
        {
            q: "Why doesn't my link show a picture on WhatsApp?",
            a: "WhatsApp draws the picture named in your page's og:image tag, and only a light one: keep it under 300 KB. Without the tag, or with a heavy file, it shows a small square or none at all.",
        },
        {
            q: "What size should the picture be?",
            a: "1200 × 630 pixels, under 300 KB. Facebook, LinkedIn and X show a smaller picture small or blurred, and WhatsApp skips a heavy one.",
        },
        {
            q: "I fixed my tags. Why does the old card still show?",
            a: "Apps keep a card for a while after they first read your page. Facebook's Sharing Debugger and LinkedIn's Post Inspector read it again on request; the others catch up on their own.",
        },
        {
            q: "What does the checker read?",
            a: "Only the public tags at the top of your page: the title, the description, the picture and X's card type, and the picture's size. It doesn't sign in anywhere, and it doesn't keep your page.",
        },
        {
            q: "What happens to my email?",
            a: "We send the report to it, and keep it with the link you checked for 12 months. We don't send you anything else. The Privacy page has the rest.",
        },
    ] satisfies FaqItem[],
};
