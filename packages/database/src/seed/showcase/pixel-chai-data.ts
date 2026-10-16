import type { SeedSite } from "../data";
import { PC_POSTS } from "./pixel-chai-posts";
import type {
    StudioPlan,
    StudioProduct,
    StudioService,
    StudioSpec,
} from "./studio";
import { blockImage, section } from "./studio";
import { STUDIO_ART } from "./studio-art";
import { PC_PHOTOS } from "./studio-photos";

/**
 * Pixel & Chai's fixed facts: a five-person social-media and local-marketing
 * agency at Shekhar Central, Palasia, Indore, that runs Instagram, Facebook,
 * Google Business Profiles and ads for the city's salons, cafés, clinics,
 * coaching classes and sweet shops. Riya Jain (founder, strategy), Aman
 * Khandelwal (ads), Sneha Patidar (content and reels), Faizan Qureshi
 * (design) and Nikita Rathi (client success and listings, the one with a
 * login).
 *
 * How it sells:
 * - RETAINERS are subscription plans billed monthly in advance — Listing
 *   care, Starter, Growth and Pro — minimum three months, then 30 days'
 *   notice; one pause a year. Every renewal is a tax invoice.
 * - ONE-OFFS are services in the diary (a free 20-minute audit call, a
 *   strategy workshop and a Google Business Profile clean-up paid online,
 *   a reel shoot day billed after) and invoices written by hand (a brand
 *   kit, a festive creative pack).
 * - A few PRINTED THINGS are products: review standees, table tents, a
 *   printed brand-kit pack. That is all it sells as goods.
 *
 * GST-registered in Madhya Pradesh (23), prices include 18% GST: retainers
 * and strategy SAC 998361 (advertising services), shoots 998385, print
 * 998912.
 */

export const PC_KEY = "pc";

const P = PC_PHOTOS;
const A = STUDIO_ART;
const MON_SAT = [1, 2, 3, 4, 5, 6] as const;

export const PC_SERVICES: readonly StudioService[] = [
    {
        key: "audit",
        name: "Free 20-minute audit call",
        description:
            "We look at your Instagram, Facebook and Google profile before the call, then tell you the three things we'd fix first — whether or not you hire us. By video, or at our office in Palasia.",
        minutes: 20,
        pricePaise: 0,
        sac: "998361",
        depositMode: "NONE",
        locationType: "EITHER",
        meetingUrl: "https://meet.jit.si/pixel-and-chai-audit",
        shown: true,
        pay: "free",
        perMonth: 20,
        ahead: [1, 7],
    },
    {
        key: "workshop",
        name: "Strategy workshop",
        description:
            "Two hours with Riya for an owner and their team: who you're for, what to post, what to stop doing, and a 90-day plan you can run yourselves. Includes GST.",
        minutes: 120,
        pricePaise: 12_000_00,
        sac: "998361",
        depositMode: "FULL",
        locationType: "EITHER",
        meetingUrl: "https://meet.jit.si/pixel-and-chai-workshop",
        shown: true,
        pay: "online",
        perMonth: 3,
        ahead: [3, 20],
    },
    {
        key: "gbp",
        name: "Google Business Profile setup & clean-up",
        description:
            "Verified, categorised, photographed and written properly: hours, services, products, the first posts and a QR for reviews. Ninety minutes with you, the rest done by Nikita. Includes GST.",
        minutes: 90,
        pricePaise: 6_500_00,
        sac: "998361",
        depositMode: "FULL",
        locationType: "EITHER",
        meetingUrl: "https://meet.jit.si/pixel-and-chai-gbp",
        shown: true,
        pay: "online",
        perMonth: 5,
        ahead: [2, 14],
    },
    {
        key: "shoot",
        name: "Reel shoot day",
        description:
            "Eight hours at your place in Indore with Sneha and a camera assistant: up to six reels shot, edited and captioned within a week. Billed after the shoot. Includes GST.",
        minutes: 480,
        pricePaise: 18_000_00,
        sac: "998385",
        depositMode: "NONE",
        locationType: "IN_PERSON",
        meetingUrl: null,
        shown: true,
        pay: "desk",
        perMonth: 5,
        ahead: [5, 21],
    },
    {
        key: "onboarding",
        name: "Onboarding call",
        description:
            "The first call with a new retainer client: access, brand questions, the first month's calendar. Booked by us.",
        minutes: 60,
        pricePaise: 0,
        sac: "998361",
        depositMode: "NONE",
        locationType: "EITHER",
        meetingUrl: "https://meet.jit.si/pixel-and-chai-onboarding",
        shown: false,
        pay: "free",
        perMonth: 3,
        ahead: [1, 5],
    },
];

export const PC_PLANS: readonly StudioPlan[] = [
    {
        key: "listing",
        name: "Listing care",
        description:
            "Your Google Business Profile, looked after: four posts a month, review replies within 48 hours, fresh photos, and a monthly report of calls and direction requests. Includes GST.",
        pricePaise: 2_999_00,
        sac: "998361",
    },
    {
        key: "starter",
        name: "Starter",
        description:
            "12 posts a month across Instagram and Facebook, captions in English and Hindi, and a one-page monthly report. Minimum three months. Includes GST.",
        pricePaise: 14_999_00,
        sac: "998361",
    },
    {
        key: "growth",
        name: "Growth",
        description:
            "20 posts and 6 reels a month, comment and DM replies six days a week, and a half-day shoot every quarter. Minimum three months. Includes GST.",
        pricePaise: 27_999_00,
        sac: "998361",
    },
    {
        key: "pro",
        name: "Pro",
        description:
            "Everything in Growth, plus Meta and Google ads managed for up to ₹1.5 lakh a month of spend (paid by you, directly to Meta and Google) and a review call every fortnight. Includes GST.",
        pricePaise: 44_999_00,
        sac: "998361",
    },
];

export const PC_PRODUCTS: readonly StudioProduct[] = [
    {
        slug: "review-standee",
        name: "“Review us on Google” standee",
        category: "print",
        description:
            "A printed counter standee with your own QR code that opens your Google review form. Sturdy 3 mm board, matte laminated. Ships in Indore in two days. Includes GST.",
        pricePaise: 1_200_00,
        hsn: "998912",
        keyPoints: [
            "Your own review QR",
            "3 mm board, matte laminate",
            "Two days in Indore",
        ],
        materials: "Sunboard with matte lamination",
        images: [A.standee, P.standee],
        option: {
            name: "Standee size",
            variants: [
                { title: "A5", sku: "PC-STD-A5", pricePaise: 1_200_00 },
                { title: "A4", sku: "PC-STD-A4", pricePaise: 1_600_00 },
            ],
        },
        fulfilment: "SHIPPING",
        demand: 10,
    },
    {
        slug: "table-tents",
        name: "Table tents, pack of 10",
        category: "print",
        description:
            "Folded cards for café and restaurant tables: your handle, an offer for tagging you, and your review QR. Designed by Faizan to match your brand. Includes GST.",
        pricePaise: 900_00,
        hsn: "998912",
        keyPoints: [
            "Pack of 10",
            "Designed to your brand",
            "Review QR on the back",
        ],
        materials: "350 gsm card, folded",
        images: [A.tableTent, P.tableTent],
        fulfilment: "SHIPPING",
        demand: 8,
    },
    {
        slug: "brand-kit-print-pack",
        name: "Brand-kit print pack",
        category: "print",
        description:
            "Your brand kit printed for the counter and the team: logo sheet, palette and type cards, and 100 visiting cards. Includes GST.",
        pricePaise: 3_500_00,
        hsn: "998912",
        keyPoints: ["Logo sheet, palette and type cards", "100 visiting cards"],
        materials: "Uncoated 300 gsm card",
        images: [A.brandKit, P.printPack],
        fulfilment: "SHIPPING",
        demand: 4,
    },
    {
        slug: "brand-kit",
        name: "Brand kit",
        category: "design",
        description:
            "A logo clean-up, a palette, two typefaces and 20 Canva templates for posts, stories and offers, so what you post looks like you. Two rounds of changes. Delivered as files in about three weeks. Includes GST.",
        pricePaise: 35_000_00,
        hsn: "998361",
        keyPoints: [
            "Logo, palette, type",
            "20 Canva templates",
            "Two rounds of changes",
        ],
        materials: null,
        images: [A.brandKit, P.designDesk],
        fulfilment: "DIGITAL",
        demand: 1,
    },
];

export const PC_CLIENTS = [
    {
        company: "Kulhad & Co.",
        kind: "Café",
        area: "Vijay Nagar",
        photo: P.cafe,
        result: "Reels three times a week for a month: saves up from 120 to 610, and Saturday footfall the owner can feel.",
    },
    {
        company: "Glow Theory Salon",
        kind: "Salon",
        area: "Palasia",
        photo: P.salon,
        result: "Bridal-season ads at ₹15,000 a month: 64 enquiries, 19 bookings, cost per enquiry ₹234.",
    },
    {
        company: "Smile Square Dental",
        kind: "Dental clinic",
        area: "Sapna Sangeeta Road",
        photo: P.dental,
        result: "Google profile cleaned up and replied to: calls from Google up from 41 to 73 a month.",
    },
    {
        company: "Annapurna Mithai Ghar",
        kind: "Sweet shop",
        area: "near Rajwada",
        photo: P.sweets,
        result: "Diwali gift-box orders on WhatsApp from one pinned post and a broadcast list.",
    },
    {
        company: "Nest Fitness",
        kind: "Gym",
        area: "Bhawarkuan",
        photo: P.gym,
        result: "A 6 am batch that ran half-empty, full within five weeks of a trial-week campaign.",
    },
    {
        company: "Bright Minds Coaching",
        kind: "Coaching institute",
        area: "Bhawarkuan",
        photo: P.coaching,
        result: "Admission-season posts in Hindi and English; demo-class sign-ups doubled on last year.",
    },
    {
        company: "Saffron Table",
        kind: "Restaurant",
        area: "South Tukoganj",
        photo: P.restaurant,
        result: "Natural-light food photography and a menu highlight a week: weekday lunch covers up a fifth.",
    },
    {
        company: "Leaf & Loom",
        kind: "Handloom store",
        area: "56 Dukan area",
        photo: P.handloom,
        result: "A weaver story a month; the Maheshwari range sold out twice before Navratri.",
    },
] as const;

const FORM_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "company", label: "Business name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone or WhatsApp", type: "tel", required: true },
    {
        name: "message",
        label: "What would you like help with?",
        type: "textarea",
        required: true,
    },
] as const;

export function pcSite(): SeedSite {
    const work = (
        variant: string,
        items: readonly (typeof PC_CLIENTS)[number][],
    ) =>
        section("projects", {
            variant,
            title: "Work for Indore businesses",
            items: items.map((c) => ({
                image: blockImage(c.photo),
                title: c.company,
                summary: c.result,
                caption: `${c.kind} · ${c.area}`,
                ...(c.company === "Kulhad & Co."
                    ? { link: "/blog/30-days-of-reels-kulhad-and-co" }
                    : c.company === "Nest Fitness"
                      ? { link: "/blog/nest-fitness-filling-the-6am-batch" }
                      : c.company === "Annapurna Mithai Ghar"
                        ? { link: "/blog/annapurna-diwali-orders-on-whatsapp" }
                        : {}),
            })),
        });
    return {
        slug: "pixel-and-chai",
        name: "Pixel & Chai",
        subdomain: "pixel-and-chai",
        published: true,
        createdDaysAgo: 400,
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    section("hero", {
                        variant: "split",
                        heading:
                            "Social media and Google for Indore's local businesses.",
                        subheading:
                            "We run Instagram, Facebook, Google Business Profiles and ads for salons, cafés, clinics and shops — on a monthly retainer, with a one-page report you'll actually read.",
                        cta: {
                            label: "Book a free 20-minute audit",
                            href: "/audit",
                            style: "primary",
                        },
                        image: blockImage(P.heroWorkspace),
                    }),
                    section("features", {
                        variant: "grid",
                        heading: "What we do",
                        items: [
                            {
                                title: "Posts and reels",
                                body: "Planned a month ahead, approved on WhatsApp, posted on time.",
                            },
                            {
                                title: "Google Business Profile",
                                body: "Photos, posts, hours and every review answered within two days.",
                            },
                            {
                                title: "Ads that are counted",
                                body: "Meta and Google ads with a cost per enquiry, not just reach.",
                            },
                            {
                                title: "A report on one page",
                                body: "First week of the month, with a twenty-minute call.",
                            },
                        ],
                    }),
                    work("rhythm", PC_CLIENTS.slice(0, 4)),
                    section("journal", {
                        variant: "default",
                        title: "Notes for owners",
                        count: 3,
                    }),
                    {
                        type: "cta",
                        content: {
                            label: "See the plans",
                            href: "/plans",
                            style: "primary",
                        },
                    },
                ],
            },
            {
                path: "/work",
                title: "Work",
                sections: [
                    work("cards", PC_CLIENTS),
                    section("richText", {
                        format: "html",
                        value: "<h2>How we report</h2><p>Every client gets one page in the first week of the month: reach, saves, profile visits, calls and direction requests from Google, enquiries, and — on Pro — ad spend and cost per enquiry. Then a twenty-minute call about what we'll change.</p>",
                        image: blockImage(A.reportSample),
                        imageSide: "right",
                    }),
                ],
            },
            {
                path: "/plans",
                title: "Plans",
                sections: [
                    section("plans", {
                        variant: "default",
                        title: "Monthly plans",
                        intro: "Prices include 18% GST. Three months minimum, then month to month with 30 days' notice. Ad spend is paid by you, directly to Meta and Google.",
                        highlight: "first",
                        buttonLabel: "Start this plan",
                    }),
                    {
                        type: "servicesList",
                        services: [1, 2, 3],
                        content: {
                            heading: "One-offs",
                            intro: "For businesses that want a hand once, not every month.",
                            showPrices: true,
                        },
                    },
                    {
                        type: "faq",
                        content: {
                            heading: "Questions owners ask",
                            items: [
                                {
                                    question: "Can I pause?",
                                    answer: "Once a year, for up to a month — for a renovation, a slow month or a family wedding. Tell us a week before the next invoice.",
                                },
                                {
                                    question: "Who approves what goes out?",
                                    answer: "You do. The month's calendar comes on WhatsApp for a thumbs-up; anything urgent, we call.",
                                },
                                {
                                    question: "When are we invoiced?",
                                    answer: "On the day your plan renews each month, due in seven days, by UPI or bank transfer. CGST and SGST are shown on every invoice.",
                                },
                                {
                                    question: "Do you need our passwords?",
                                    answer: "No. You add us as a partner on Meta Business and as a manager on your Google profile, and you can remove us any time.",
                                },
                            ],
                        },
                    },
                ],
            },
            {
                path: "/audit",
                title: "Free audit",
                sections: [
                    {
                        type: "booking",
                        service: 0,
                        content: {
                            title: "Book a free 20-minute audit",
                            description:
                                "Send us your Instagram and Google profile links in the notes. We'll look before the call.",
                            submitLabel: "Book the call",
                            successMessage:
                                "Booked — the video link is in your confirmation.",
                        },
                    },
                ],
            },
            {
                path: "/contact",
                title: "Contact",
                sections: [
                    {
                        type: "enquiry",
                        form: {
                            name: "New business enquiry",
                            fields: FORM_FIELDS,
                        },
                        content: {
                            title: "Tell us about your business",
                            description:
                                "What you sell, where, and what isn't working. Riya replies within a working day.",
                            submitLabel: "Send",
                            successMessage:
                                "Thanks — we'll reply within a working day.",
                        },
                    },
                    section("richText", {
                        format: "html",
                        value: "<h2>The office</h2><p>302, Shekhar Central, AB Road, Palasia, Indore 452001. Monday to Saturday, 10 to 7. Chai is always on.</p><p>Call or WhatsApp +91 98260 33415.</p>",
                        image: blockImage(P.indore),
                        imageSide: "left",
                    }),
                ],
            },
            {
                path: "/journal",
                title: "Journal",
                sections: [
                    section("journal", {
                        variant: "archive",
                        title: "Journal",
                        showTotal: true,
                    }),
                ],
            },
        ],
    };
}

export function pcSpec(): StudioSpec {
    return {
        key: PC_KEY,
        name: "Pixel & Chai",
        slug: "pixel-and-chai",
        legalName: "Pixel and Chai Media Private Limited",
        contactEmail: "pixelandchai@example.com",
        phone: "+919826033415",
        gst: {
            state: "23",
            stateName: "Madhya Pradesh",
            pan: "AAKCP6614R",
            prefix: "PC",
        },
        address: {
            addressLine1: "302, Shekhar Central, AB Road",
            addressLine2: "Palasia",
            city: "Indore",
            postalCode: "452001",
        },
        createdDaysAgo: 560,
        modules: [
            "APPOINTMENTS",
            "CRM",
            "WEBSITE",
            "PAYMENTS",
            "COMMERCE",
            "INSIGHTS",
        ],
        store: {
            description:
                "Printed standees, table tents and brand kits from Pixel & Chai, Indore.",
            openingHours: [
                { day: "MON", open: "10:00", close: "19:00", closed: false },
                { day: "TUE", open: "10:00", close: "19:00", closed: false },
                { day: "WED", open: "10:00", close: "19:00", closed: false },
                { day: "THU", open: "10:00", close: "19:00", closed: false },
                { day: "FRI", open: "10:00", close: "19:00", closed: false },
                { day: "SAT", open: "10:00", close: "19:00", closed: false },
                { day: "SUN", open: "10:00", close: "19:00", closed: true },
            ],
        },
        staff: [
            {
                key: "riya",
                name: "Riya Jain",
                title: "Founder, strategy",
                services: ["audit", "workshop", "onboarding"],
                hours: [{ days: MON_SAT, from: "10:00", to: "19:00" }],
            },
            {
                key: "aman",
                name: "Aman Khandelwal",
                title: "Performance ads",
                services: ["audit", "onboarding"],
                hours: [{ days: [1, 2, 3, 4, 5], from: "10:00", to: "19:00" }],
            },
            {
                key: "sneha",
                name: "Sneha Patidar",
                title: "Content and reels",
                services: ["shoot"],
                hours: [{ days: MON_SAT, from: "09:00", to: "19:00" }],
            },
            {
                key: "faizan",
                name: "Faizan Qureshi",
                title: "Design",
                services: ["workshop"],
                hours: [{ days: [1, 2, 3, 4, 5], from: "11:00", to: "19:00" }],
            },
            {
                key: "nikita",
                name: "Nikita Rathi",
                title: "Client success and listings",
                services: ["audit", "gbp", "onboarding"],
                hours: [{ days: MON_SAT, from: "10:00", to: "18:30" }],
                member: true,
            },
        ],
        rules: {
            bookAheadDays: 30,
            latestBookingMinutes: 120,
            freeCancelHours: 12,
        },
        services: PC_SERVICES,
        categories: [
            { key: "print", name: "Printed" },
            { key: "design", name: "Design" },
        ],
        products: PC_PRODUCTS,
        plans: PC_PLANS,
        pipeline: {
            name: "New business",
            stages: [
                "New lead",
                "Audit call booked",
                "Audit done",
                "Proposal sent",
                "Signed",
            ],
        },
        site: pcSite(),
        footer: "Pixel & Chai · 302, Shekhar Central, AB Road, Palasia, Indore 452001 · +91 98260 33415",
        posts: PC_POSTS,
    };
}
