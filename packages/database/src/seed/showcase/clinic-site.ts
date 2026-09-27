import type { SeedSite } from "../data";
import { KAVI_PHONE, KAVI_SITE_COPY, SVC } from "./clinic-data";

/**
 * Kavi Dental's website (E29), in the Customer Site design's words: a home
 * page that sends patients to the booking page (`/book`, which lists the
 * services shown on it), what a visit is like, and where to find the clinic.
 * Written the way every seeded site is (`writeSite`), and published.
 */
export const KAVI_SITE: SeedSite = {
    slug: "kavi-dental",
    name: "Kavi Dental",
    subdomain: "kavi-dental",
    published: true,
    createdDaysAgo: 90,
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    type: "hero",
                    content: {
                        heading: KAVI_SITE_COPY.title,
                        subheading: KAVI_SITE_COPY.text,
                        cta: {
                            label: "Book an appointment",
                            href: "/book",
                            style: "primary",
                        },
                        // "Free today" beside the headline (G18).
                        onToday: true,
                    },
                },
                {
                    type: "servicesList",
                    services: [
                        SVC.checkUp,
                        SVC.review,
                        SVC.rootCanal,
                        SVC.whitening,
                        SVC.video,
                    ],
                    content: { heading: "What we do", showPrices: true },
                },
                {
                    type: "features",
                    content: {
                        heading: "What happens at a check-up",
                        items: [
                            {
                                title: "We look, clean and explain",
                                body: "Thirty minutes, no surprises.",
                            },
                            {
                                title: "A plan and a price first",
                                body: "If anything needs treatment, you get a written plan and a price before we start.",
                            },
                            {
                                title: "Tell us what worries you",
                                body: "Medicines, allergies, pregnancy or nerves: say so when you book. Only your dentist and the clinic team see it.",
                            },
                        ],
                    },
                },
                {
                    type: "faq",
                    content: {
                        heading: "Before you come in",
                        items: [
                            {
                                question: "Do root canals hurt?",
                                answer: "Modern anaesthetic means most patients feel pressure, not pain. It's usually three short visits.",
                            },
                            {
                                question:
                                    "Can I talk to a dentist without coming in?",
                                answer: "Yes. Book a video consultation and we'll send the link with your confirmation.",
                            },
                            {
                                question: "Is there GST on treatment?",
                                answer: "No. Healthcare is exempt, so the price you see is what you pay.",
                            },
                        ],
                    },
                },
            ],
        },
        {
            path: "/visit",
            title: "Visit us",
            sections: [
                {
                    type: "richText",
                    content: {
                        format: "html",
                        value: `<h2>Come and see us</h2><p>${KAVI_SITE_COPY.address}</p><p>${KAVI_SITE_COPY.hours}</p><p>Call the desk on ${KAVI_PHONE}.</p>`,
                    },
                },
            ],
        },
    ],
};
