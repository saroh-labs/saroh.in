import type { Combo } from "../types";

export const quoteWebDeveloper: Combo = {
    document: "quote",
    trade: "web-developer",
    reviewed: false,
    lede: "A fixed price for a defined website: pages, features, milestones, what launch means, and what happens to care and hosting after you hand it over.",
    items: [
        {
            line: "Plan and wireframes",
            billedBy: "A fixed fee",
            description: "Site plan and wireframes",
            qty: "1",
            rate: "800",
        },
        {
            line: "Page templates",
            billedBy: "Per template",
            description: "Page templates built",
            qty: "6",
            rate: "300",
        },
        {
            line: "Online shop",
            billedBy: "A fixed fee",
            description: "Shop with card checkout",
            qty: "1",
            rate: "2500",
        },
        {
            line: "Content entry",
            billedBy: "Per page",
            description: "Client content added, per page",
            qty: "15",
            rate: "20",
        },
        {
            line: "Launch",
            billedBy: "A one-time fee",
            description: "Launch and domain switch",
            qty: "1",
            rate: "300",
        },
        {
            line: "Care plan",
            billedBy: "Per month, optional",
            description: "Care plan, first 3 months",
            qty: "3",
            rate: "80",
        },
    ],
    payment: {
        text: "Split a fixed-price build into stages the client can see working. Each payment falls due at a sign-off, so the money and the progress move together.",
        points: [
            "First part on acceptance",
            "A payment at each signed-off milestone",
            "The last part when the site is ready to go live",
        ],
    },
    fields: [
        {
            name: "Milestones and dates",
            why: "Each stage with its payment shows the client what they get, and when they pay for it.",
        },
        {
            name: "Browsers and devices covered",
            why: "This stops a complaint about a very old browser from becoming free work.",
        },
        {
            name: "Bug-fix period",
            why: "Say how long faults in your work are fixed free after launch.",
        },
    ],
    example: {
        number: "Q-0422",
        facts: [
            { label: "Site", value: "New shop site" },
            { label: "Milestones", value: "3 stages" },
        ],
        note: "Domain and hosting stay in the client's name.",
        termsText:
            "Price covers the pages and features listed. New features are quoted separately. Faults in our work are fixed free for 30 days after launch.",
    },
    tips: [
        {
            title: "Define when a page is finished",
            text: "Say what done looks like, such as approved on a staging link. Otherwise, a shop owner's nephew can reopen a finished page by saying the header feels a bit big.",
        },
        {
            title: "Make the care plan a choice",
            text: "Show it as a separate optional line. The client understands that updates aren't part of the build, and you've raised the question before their first plugin breaks at launch.",
        },
        {
            title: "Require content by a date",
            text: "The client supplying words and pictures is the delay you can't control. Add a date for them, and say your own launch date moves day for day if theirs slips.",
        },
    ],
    faqs: [
        {
            question: "Who should own the domain and hosting in my quote?",
            answer: "The client, wherever you can manage it. Put accounts in their name and ask to be added as a helper. Moving away later is then painless for them, and you aren't stuck paying renewals if they disappear on you.",
        },
        {
            question:
                "How do I quote when the client wants a site like a famous one?",
            answer: "Ask which three things they really like about it, then quote for those. A big brand's site may hide years of work. Write the chosen features on your quote, so 'like theirs' can't grow into everything they do.",
        },
        {
            question: "What should I say about speed and search rankings?",
            answer: "Promise only what's in your hands, such as compressed images, clean page titles or a speed score on a named page at handover. Never quote a ranking as part of the deal, because you can't control it or a rival's site.",
        },
        {
            question: "Does a quote need to say who owns the code?",
            answer: "It should. Say when rights pass to the client, and list anything that stays yours, such as tools you reuse across jobs. Open-source parts keep their own licences, and a single line saying so heads off confusion.",
        },
    ],
};
