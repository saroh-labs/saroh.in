/**
 * /features/website on saroh.tech: saroh.in's Reach page (boards FWDesk and
 * FWPhone2, DEC-221) with Global's words. Every name, price, time and
 * address comes from the world (`content/world.ts`, Thistlewick Bakery);
 * the words around them are this file's.
 *
 * What differs from saroh.in, by what Global can do today
 * (`content/features.ts`, website is Limited):
 * - a site lives on a saroh.app address: no own domain, so the address
 *   section draws one card and no DNS records;
 * - one person runs the business: no reviewer, no team;
 * - Thistlewick takes no bookings, so the slot saroh.in gives a class is
 *   its made-to-order cake, which the site reads from Products;
 * - no plan on sale (DEC-211): no plan terms, whatever `open` says.
 *
 * `shop` is the `site-shop` claim, as on saroh.in.
 */
import type {
    LookWords,
    WebsiteWords,
} from "@saroh/marketing/feature-pages/website/words";

import { TEMPLATE_LOOKS, THISTLEWICK_TUESDAY, WORLD } from "./world";

const bakery = WORLD.lead;
const [salon, gym] = WORLD.others;
const item = (key: string) => {
    const found = bakery.items.find((i) => i.key === key);
    if (!found) throw new Error(`world: no item ${key}`);
    return found;
};

const change = THISTLEWICK_TUESDAY.priceChange;
const six = item(change.item);
/** The six-pack, in the words pages use (no "pack" in Global's words, DEC-099). */
const BOX = "box of six";
const loaf = item("sourdough");
const focaccia = item("focaccia");
const truffle = item("truffle-cake");
const beans = item("beans");
const box = THISTLEWICK_TUESDAY.holiday.box;
const notice = THISTLEWICK_TUESDAY.cakeNotice;
const owner = bakery.owner;
const slug = bakery.site.split(".")[0];
const host = bakery.site.slice(slug.length);
const street = bakery.place.split(",")[0];
const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);

export function websiteWords({
    shop,
    templates = false,
}: {
    shop: boolean;
    /** The Templates switch is on (DEC-216): the page may name a template. */
    templates?: boolean;
}): WebsiteWords {
    return {
        name: "Website builder",
        title: {
            before: "A website that keeps up with your ",
            mark: "business.",
        },
        lede: shop
            ? `Change the cinnamon bun box of six from ${change.from} to ${change.to} in Products, and your site says ${change.to}. No page to edit. It lives at a ${host.slice(1)} address, in a look made for your trade.`
            : `Change your products, prices or hours once in Saroh, and your site says it. No page to edit. It lives at a ${host.slice(1)} address, in a look made for your trade.`,
        secondary: "Try a look for your trade",
        note: "Free to start. No card needed.",

        signature: {
            at: "Tue 7 am",
            line: `The price she changed on Monday, the bakery's closed day, is already ${change.to} on her site. Change it once, in Products or by asking.`,
            label: `The ${six.name} ${BOX} changed from ${change.from} to ${change.to} in Products, and ${bakery.name}'s shop showing ${change.to}`,
            place: "Sell",
            page: "Products",
            rows: [
                {
                    key: six.key,
                    name: `${six.name}, ${BOX}`,
                    note: "Online and at the counter",
                    from: change.from,
                    to: change.to,
                },
                {
                    key: loaf.key,
                    name: loaf.name,
                    note: `${cap(loaf.unit)} · Online and at the counter`,
                    price: loaf.price,
                },
                {
                    key: focaccia.key,
                    name: focaccia.name,
                    note: "Online and at the counter",
                    price: focaccia.price,
                },
            ],
            arrow: "Shop",
            shopUrl: `${bakery.site}/shop`,
            shopItem: {
                name: six.name,
                unit: cap(BOX),
                price: change.to,
                badge: "Updated",
            },
            phoneMore: "See what else it reads",
            phoneMoreMeta: "Cakes, hours",
            phoneList: [
                `Products and the prices of the day: ${loaf.name.toLowerCase()} ${loaf.price}, ${focaccia.name.toLowerCase()} ${focaccia.price}, ${beans.name.toLowerCase()} ${beans.price}.`,
                `Cakes made to order: ${truffle.name.toLowerCase()}, ${truffle.unit}, ${truffle.price}, with ${notice}.`,
                `Hours and address: ${bakery.place}. ${WORLD.hours}`,
            ],
        },

        looks: {
            id: "looks",
            title: "Then pick the look for your trade.",
            label: "Then pick its look",
            group: "Look",
            note: "Same products, prices and hours in every look.",
            frame: `${bakery.name}'s website at ${bakery.site}, with its shop and cakes to order`,
            example: "Example",
            options: [
                {
                    business: bakery,
                    label: "Bakery look",
                    line: "Thistlewick's own site, as it is today.",
                },
                {
                    business: { ...salon, look: TEMPLATE_LOOKS.salon },
                    label: "Salon look",
                    line: "Your words and prices, a salon's colours and type.",
                },
                {
                    business: { ...gym, look: TEMPLATE_LOOKS.gym },
                    label: "Gym look",
                    line: "Same shop, same cakes, a gym's bolder type.",
                },
            ] satisfies LookWords[],
            site: {
                name: bakery.name,
                address: bakery.site,
                nav: ["Home", "Shop", "Cakes", "Visit us", "Journal"],
                order: "Order",
                headline: "Bread and pastry, baked before you wake.",
                line: `A neighborhood bakery on ${street}. Order for pick-up, or stop by the counter.`,
                ctas: ["Order for pick-up", "Order a cake"],
                open: "Open now · closes 4 pm",
                shopTitle: "What we bake",
                seeShop: "See the shop",
                products: [
                    {
                        key: six.key,
                        name: six.name,
                        unit: cap(BOX),
                        price: change.to,
                        badge: "Updated",
                    },
                    {
                        key: loaf.key,
                        name: loaf.name,
                        unit: cap(loaf.unit),
                        price: loaf.price,
                    },
                    {
                        key: focaccia.key,
                        name: focaccia.name,
                        unit: "Olive oil, rosemary, salt",
                        price: focaccia.price,
                    },
                    {
                        key: truffle.key,
                        name: truffle.name,
                        unit: truffle.unit ?? "",
                        price: truffle.price,
                    },
                ],
                classTitle: `${truffle.name} · made to order`,
                classLine: `Made to order with ${notice}. ${truffle.unit}, ${truffle.price}.`,
                slot: `Pick up from Saturday · ${truffle.price}`,
                classShort: `${truffle.name} · to order`,
                leftShort: notice,
                book: "Order a cake",
                foot: [bakery.place, WORLD.hours ?? ""],
                pins: {
                    products: "From Products",
                    bookings: "From Products",
                    hours: "From your hours",
                },
            },
            templates:
                "Setup shows the looks made for your trade first, with your name in them. Change the look later, and your prices stay.",
            templatesLink: "See every template",
            templatesMeta: "3 trade looks",
            of: "of",
        },

        records: {
            title: "What you already added is already on it.",
            lead: "Prices are only the start. Your site reads your products, prices, hours and address from Saroh, so it says what's true today.",
            live: "Live",
            products: [
                {
                    key: six.key,
                    name: `${six.name}, ${BOX}`,
                    note: "Downtown · Online",
                    price: change.to,
                },
                {
                    key: loaf.key,
                    name: loaf.name,
                    note: `${cap(loaf.unit)} · Online`,
                    price: loaf.price,
                },
                {
                    key: truffle.key,
                    name: truffle.name,
                    note: `${truffle.unit} · Online`,
                    price: truffle.price,
                },
            ],
            classRow: {
                name: `${truffle.name}, ${truffle.unit}`,
                note: `Made to order · ${notice}`,
                count: truffle.price,
            },
            classPlace: "Products",
            classTail:
                "Each cake's notice and price are read from Products, so the site never promises one you can't bake.",
            hoursPlace: "Settings",
            hoursPage: "Hours",
            hours: THISTLEWICK_TUESDAY.hours,
            visit: "Visit us",
            arrows: {
                shop: "Shop",
                booking: "Cakes to order",
                hours: "Hours, address",
            },
            pay: {
                before: "Card payments on your shop go ",
                bold: `through your own ${WORLD.money.provider} account`,
                after: ". Saroh never holds the money.",
                link: "How payments work",
            },
        },

        address: {
            title: "Your address, from the first day.",
            lead: `Every site starts at a ${host.slice(1)} address, ready the moment you publish. A domain you already own can't be connected yet.`,
            web: {
                title: "Web address",
                sub: `At ${host.slice(1)}.`,
                slug,
                host,
                foot: "This is where your shop and every page you publish live, from the moment you start.",
            },
            live: "Live",
            records: "See the two records to add",
            recordsMeta: "CNAME and TXT",
            head: ["Type", "Name", "Value", "Status"],
            rows: [
                ["CNAME", "www", "Shown in Saroh"],
                ["TXT", "Shown", "Shown in Saroh"],
            ],
            found: "Found",
        },

        draft: {
            title: "Change it on the page. Publish when it's right.",
            lead: "Your changes stay a draft until you publish. Send a preview link first when someone should see it before it goes live, and every publish is kept.",
            label: "The site editor with the Home page's top section selected and two unpublished changes",
            page: "Home",
            state: "Draft · 2 changes",
            preview: "Preview link",
            publish: "Publish",
            sectionsTitle: "Sections on Home",
            sections: [
                "Top of page",
                "Products",
                "What we bake",
                "Hours",
                "Visit us",
            ],
            addSection: "Add a section",
            selected: "Top of page",
            hero: {
                title: "The holiday boxes are in",
                line: `The ${box.name.toLowerCase()}, ${box.price}, packed to give. Order two days ahead.`,
                cta: "See the holiday menu",
            },
            history: "Version history",
            versions: [
                { when: `Sun 15 Nov, 1:12 pm · ${owner}`, live: "On the site" },
                { when: `Fri 6 Nov, 9:40 am · ${owner}` },
                { when: `Tue 3 Nov, 4:05 pm · ${owner}` },
            ],
            published: "Published",
            putBack: "Put back",
            previewTitle: "Preview link, for someone to check first",
            previewNote: "Link copied · works until you publish",
            points: [
                {
                    title: "Draft, then publish",
                    body: "Nothing changes for customers until you press Publish.",
                },
                {
                    title: "Every version kept",
                    body: "Each publish is kept in Version history, and you can put an earlier one back.",
                },
                {
                    title: "Your look, everywhere",
                    body: "Choose a colourway, a pair of typefaces and the spacing, and every page follows.",
                },
            ],
            phoneMore: "See version history",
            phoneMoreMeta: "Put back",
        },

        sections: {
            title: "Pages, built from sections.",
            lead: "Add a page, then stack the sections it needs. The shop and your hours are sections like any other, already joined to your records.",
            pages: [
                ["Home", "/"],
                ["Shop", "/shop"],
                ["Cakes", "/cakes"],
                ["Visit us", "/visit"],
                ["Journal", "/journal"],
            ],
            addPage: "Add a page",
            read: {
                title: "Read from your records",
                body: "Products, Booking, Timetable, Prices and Hours. They fill themselves from Products, Bookings, your services and Settings.",
            },
            fill: {
                title: "Yours to fill",
                body: "Top of page, Gallery, Enquiry form, Visit us, FAQ, Journal, Testimonials and more. An enquiry form adds the person to your contacts as a lead.",
            },
        },

        shared: {
            title: "Looks right when it's shared.",
            lead: "Set the title, description and share picture once. Saroh tells you when the picture is too small for Facebook and LinkedIn, or too heavy for WhatsApp. Each site has its own sitemap for search.",
            chatLabel: `${bakery.name}'s link shared in a WhatsApp chat, with its picture, title and description`,
            who: "Maya, in the family group",
            card: {
                title: `${bakery.name} · Bakery on ${street}`,
                line: "Bread and pastry, baked before you wake. Order for pick-up.",
                url: bakery.site,
            },
            message: "Getting the cinnamon buns for Sunday, who's in?",
            time: "8:14 pm",
            panel: "Search and sharing",
            panelPage: "Home page",
            fields: [
                ["Page title", `${bakery.name} · Bakery on ${street}`],
                [
                    "Description",
                    "Bread and pastry, baked before you wake. Order for pick-up.",
                ],
            ],
            picture: "Share picture",
            warn: "Too small for Facebook and LinkedIn. Try one at least 1200 wide.",
            sitemap: ["Sitemap", `${bakery.site}/sitemap.xml`],
            google: ["Google Search Console", "Code added"],
            bing: ["Bing Webmaster Tools", "Not added"],
            phoneMore: "See search and sharing",
            phoneMoreMeta: "Sitemap",
        },

        ask: {
            title: "Or ask for the change.",
            at: THISTLEWICK_TUESDAY.holiday.at,
            body: `, closing up, ${owner} asks Claude to put the holiday menu on a holiday page. Connect Claude or ChatGPT to Saroh and ask for a change in your words. It saves a draft, and nothing goes live until you publish it in Saroh.`,
            link: "How AI apps work",
            label: `Claude, connected to ${bakery.name}, adds the holiday menu and saves it as drafts`,
            app: "Claude",
            connected: `connected to ${bakery.name}`,
            ask: `Add the holiday menu: a ${box.name.toLowerCase()}, ${box.price}, and the ${truffle.name.toLowerCase()}, ${truffle.price}. Put them on a holiday page.`,
            answer: `Done, as drafts. The ${box.name.toLowerCase()} is in Products, and a new holiday page at ${THISTLEWICK_TUESDAY.holiday.page} shows it with the truffle cake. Nothing changes on your site until you publish it in Saroh.`,
            draft: "Holiday page · draft waits for you in Saroh",
            draftUrl: `${bakery.site}${THISTLEWICK_TUESDAY.holiday.page}`,
        },

        tail: {
            // Thistlewick's day isn't written yet: no moment.
            moment: "",
            momentLead: "Seen in a day:",
            momentAt: "10:00",
            momentLink: `See 10 am at ${bakery.name}`,
            plan: "Everyone is on Free for now.",
            compare: "Tell me when",
            works: "Works with",
        },

        faq: [
            {
                q: "Do I edit the site when a price changes?",
                a: "No. Products, prices and hours are read from Saroh. Change them there and the site shows it.",
            },
            {
                q: "Can I use my own domain?",
                a: `Not yet. Every site lives at a ${host.slice(1)} address today.`,
            },
            {
                q: "Does anything go live without me?",
                a: "No. Changes stay a draft until you publish, including ones made from Claude or ChatGPT.",
            },
            ...(templates
                ? [
                      {
                          q: "Can I change the template later?",
                          a: "Yes. Pick another in the editor. Saroh shows you the preview first, then asks before it replaces any pages.",
                      },
                  ]
                : []),
            {
                q: "Is it in other languages?",
                a: 'Not yet. Your site is in English today, with a "Made with Saroh" credit.',
            },
        ],
        ask_us: {
            lead: "Something else?",
            label: "Ask us",
            href: "/contact",
            more: "All questions",
        },

        close: {
            title: "Put your business on a site of its own.",
            note: "Free to start. No card needed.",
        },
        inTheApp: {
            everything: "Everything the website builder does",
            usedBy: "Used by",
            of: "of",
            /** On a phone, the steps and what follows fold behind this. */
            phone: "See it in the app, step by step",
        },
    };
}
