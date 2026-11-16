/**
 * /features/website, the Reach page built around its signature (boards
 * FWDesk and FWPhone2, DEC-221): change a price once in Products and the
 * site says it. Every name, price, time and address comes from the world
 * (`content/world.ts`); the words around them are this file's.
 *
 * Two switches shape the words:
 * - `shop` is the `site-shop` claim: products and the shop on a merchant's
 *   site wait for `SITE_SHOP` (claims ledger H12). Off, the page tells the
 *   same story with the services, the class and the hours the site does
 *   read today, and draws no shop.
 * - `open` is the launch switch: plan terms ("on every plan", "a paid plan")
 *   are said only once it is open, as a point's `openNote` is (DEC-136).
 */
import type {
    LookWords,
    WebsiteWords,
} from "@saroh/marketing/feature-pages/website/words";

import { LOOK_BANDS } from "./reach-looks";
import { RYE_MONDAY, WORLD } from "./world";

const rye = WORLD.lead;
const item = (key: string) => {
    const found = rye.items.find((i) => i.key === key);
    if (!found) throw new Error(`world: no item ${key}`);
    return found;
};
/** "Cardamom bun box" → "bun box", as Asha says it. */
const said = (name: string) =>
    name.split(" ").slice(-2).join(" ").toLowerCase();

const change = RYE_MONDAY.priceChange;
const bun = item(change.item);
const loaf = item("sourdough");
const brownie = item("brownie-box");
const rose = item("rose-pistachio");
const plum = item("plum-cake");
const hamper = item("hamper");
const cls = RYE_MONDAY.class;
const left = cls.places - cls.booked;
const kavya = rye.orders?.find((o) => o.id === "ORD-1048");
const owner = rye.owner;
const slug = rye.site.split(".")[0];
const host = rye.site.slice(slug.length);
const area = rye.place.split(",")[0];
const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
/** The second provider the world names: "Cashfree". */
const otherProvider = WORLD.money.otherProviders?.split(",")[0];

export function websiteWords({
    shop,
    open,
    templates = false,
}: {
    shop: boolean;
    open: boolean;
    /** The Templates gallery is on (DEC-135): the page may name a template. */
    templates?: boolean;
}): WebsiteWords {
    return {
        name: "Website builder",
        title: {
            before: "A website that keeps up with your ",
            mark: "business.",
        },
        lede: shop
            ? `Change the ${said(bun.name)} from ${change.from} to ${change.to} in Products, and your site says ${change.to}. No page to edit. It lives at your own address, in a look made for your trade.`
            : "Change your services, prices or hours once in Saroh, and your site says it. No page to edit. It lives at your own address, in a look made for your trade.",
        secondary: "Try a look for your trade",
        note: open
            ? "Free to start. No card needed. The site is on every plan."
            : "Free to start. No card needed.",

        signature: {
            at: "Tue 7 am",
            line: `The price she changed last night is already ${change.to} on her site. Change it once, in Products or by asking.`,
            label: `The ${bun.name} changed from ${change.from} to ${change.to} in Products, and ${rye.name}'s shop showing ${change.to}`,
            place: "Sell",
            page: "Products",
            rows: [
                {
                    key: bun.key,
                    name: bun.name,
                    note: `${cap(bun.unit)} · Online and at the counter`,
                    from: change.from,
                    to: change.to,
                },
                {
                    key: loaf.key,
                    name: loaf.name,
                    note: "Online and at the counter",
                    price: loaf.price,
                },
                {
                    key: brownie.key,
                    name: `${brownie.name} (6)`,
                    note: "Online and at the counter",
                    price: brownie.price,
                },
            ],
            arrow: "Shop",
            shopUrl: `${rye.site}/shop`,
            shopItem: {
                name: bun.name,
                unit: cap(bun.unit),
                price: change.to,
                badge: "Updated",
            },
            phoneMore: "See what else it reads",
            phoneMoreMeta: "Classes, hours",
            phoneList: [
                `Products and the prices of the day: ${said(loaf.name)} ${loaf.price}, ${said(brownie.name)} ${brownie.price}, ${rose.name.toLowerCase()} ${rose.price}.`,
                `Classes and real free times: ${cls.name}, ${cls.when.replace(", 10 am", "")}, 10:00 am, ${left} places left.`,
                `Hours, phone and address: ${rye.place}, open 7 am to 8 pm.`,
            ],
        },

        looks: {
            id: "looks",
            title: "Then pick the look for your trade.",
            label: "Then pick its look",
            group: "Look",
            note: "Same products, prices and times in every look.",
            frame: `${rye.name}'s website at ${rye.site}, with its shop and class booking`,
            example: "Example",
            options: [
                {
                    business: rye,
                    label: "Bakery look",
                    line: "Your own bakery's warm cream and terracotta.",
                    band: LOOK_BANDS.rye,
                },
                {
                    business: WORLD.others[0],
                    label: "Salon look",
                    line: "Your words and prices, a salon's colours and type.",
                },
                {
                    business: WORLD.others[1],
                    label: "Gym look",
                    line: "Same shop, same class, a gym's bolder type.",
                },
                {
                    business: WORLD.others[2],
                    label: "Florist look",
                    line: "Same shop in a florist's garnet and blush, soft and rounded.",
                },
            ] satisfies LookWords[],
            site: {
                name: rye.name,
                address: rye.site,
                nav: ["Home", "Shop", "Classes", "Visit us", "Journal"],
                order: "Order",
                headline: `Baked this morning on ${area}`,
                line: "Breads, buns and celebration cakes. Order by 8 pm and collect from 8 am the next day.",
                ctas: ["Order for tomorrow", "Book a class"],
                open: "Open now · closes 8 pm",
                shopTitle: "This week's bakes",
                seeShop: "See the shop",
                products: [
                    {
                        key: bun.key,
                        name: bun.name,
                        unit: cap(bun.unit),
                        price: change.to,
                    },
                    {
                        key: loaf.key,
                        name: loaf.name,
                        unit: "800 g",
                        price: loaf.price,
                    },
                    {
                        key: brownie.key,
                        name: brownie.name,
                        unit: cap(brownie.unit),
                        price: brownie.price,
                    },
                    {
                        key: plum.key,
                        name: plum.name,
                        unit: `${plum.unit} · Christmas`,
                        price: plum.price,
                        badge: "New",
                    },
                ],
                classTitle: `${cls.name} · ${cls.when.split(",")[0]}`,
                classLine: `Two hours at the big table. You take your loaf home. ${cls.price}.`,
                slot: `10:00 am · ${left} places left`,
                classShort: `${cls.name} · ${cls.when.split(" ")[0]} 10 am`,
                leftShort: `${left} left`,
                book: "Book a place",
                foot: [rye.place, "Open 7 am to 8 pm · Sunday 8 am to 2 pm"],
                pins: {
                    products: "From Products",
                    bookings: "From Bookings",
                    hours: "From your hours",
                },
            },
            templates:
                "Setup shows the looks made for your trade first, with your name in them. Change the look later; your prices stay.",
            templatesLink: "See every template",
            templatesMeta: "4 trade looks",
            of: "of",
        },

        records: {
            title: "What you already added is already on it.",
            lead: "Prices are only the start. Your site reads your products, classes, free times, hours, phone and address from Saroh, so it says what's true today.",
            live: "Live",
            products: [
                {
                    key: bun.key,
                    name: bun.name,
                    note: `${area} · Online`,
                    price: change.to,
                },
                {
                    key: loaf.key,
                    name: loaf.name,
                    note: "800 g · Online",
                    price: loaf.price,
                },
                {
                    key: rose.key,
                    name: rose.name,
                    note: `${rose.unit} · Online`,
                    price: rose.price,
                },
            ],
            classRow: {
                name: `${cls.when.replace(", 10 am", "")}, 10:00 am`,
                note: `With ${owner} · the big table · ${cls.price}`,
                count: `${cls.booked} of ${cls.places}`,
            },
            classPlace: "Calendar",
            classTail:
                "Only real free times are offered. Customers sign in with a code.",
            hoursPlace: "Settings",
            hoursPage: "Hours",
            hours: [
                ["Monday to Saturday", "7:00 am to 8:00 pm"],
                ["Sunday", "8:00 am to 2:00 pm"],
            ] as const,
            visit: "Visit us",
            arrows: {
                shop: "Shop",
                booking: "Booking page",
                hours: "Hours, phone, address",
            },
            pay: {
                before: "Shop payments land in ",
                bold: `your own ${WORLD.money.provider}${otherProvider ? ` or ${otherProvider}` : ""} account`,
                after: ". Saroh never holds the money.",
                link: "How payments work",
            },
        },

        address: {
            title: "Your address, from the first day.",
            lead: open
                ? `Every site starts at a free ${host.slice(1)} address. When you're ready, connect a domain you own with two records at your registrar, and the screen tells you when it's live.`
                : `Every site starts at a ${host.slice(1)} address. When you're ready, connect a domain you own with two records at your registrar, and the screen tells you when it's live.`,
            web: {
                title: "Web address",
                sub: open ? "Free, on every plan." : `At ${host.slice(1)}.`,
                slug,
                host,
                foot: "This is where your shop, booking page and every page you publish live, from the moment you start.",
            },
            own: {
                title: "Your own domain",
                sub: open
                    ? "Connected through www. Comes with a paid plan."
                    : "Connected through www.",
                domain: `www.${rye.domain}`,
                foot: "Add both at the place you bought the domain. Example domain; yours will differ.",
            },
            live: "Live",
            records: "See the two records to add",
            recordsMeta: "CNAME and TXT",
            head: ["Type", "Name", "Value", "Status"],
            rows: [
                ["CNAME", "www", "Shown in Saroh"],
                ["TXT", "Shown", "Shown in Saroh"],
            ] as const,
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
                "Booking",
                "Hours",
                "Visit us",
            ],
            addSection: "Add a section",
            selected: "Top of page",
            hero: {
                title: "Christmas is on the menu",
                line: `${plum.name} and the ${hamper.name}, packed to give. Order by 8 pm.`,
                cta: "See the Christmas menu",
            },
            history: "Version history",
            versions: [
                { when: `Sun 15 Nov, 7:12 pm · ${owner}`, live: "On the site" },
                { when: `Fri 6 Nov, 9:40 am · ${owner}` },
                { when: `Mon 2 Nov, 8:05 pm · ${owner}` },
            ],
            published: "Published",
            putBack: "Put back",
            previewTitle: "Preview link, for someone to check first",
            previewNote: "Link copied · works until you publish",
            points: [
                {
                    title: "Draft, then publish",
                    body: "Nothing changes for customers until you press Publish, or send it to your reviewer.",
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
            more: "What sections read, and what you fill",
            title: "Pages, built from sections.",
            lead: "Add a page, then stack the sections it needs. The shop, the booking page and your hours are sections like any other, already joined to your records.",
            pages: [
                ["Home", "/"],
                ["Shop", "/shop"],
                ["Classes", "/classes"],
                ["Visit us", "/visit"],
                ["Journal", "/journal"],
            ] as const,
            addPage: "Add a page",
            read: {
                title: "Read from your records",
                body: "Products, Booking, Timetable, Prices and Hours. They fill themselves from Products, Bookings, your classes, your services and Settings.",
            },
            fill: {
                title: "Yours to fill",
                body: "Top of page, Gallery, Enquiry form, Visit us, Class packs, Plans, FAQ, Journal, Testimonials and more. An enquiry form adds a lead for your team.",
            },
        },

        shared: {
            more: "See the whole preview",
            title: "Looks right when it's shared.",
            lead: "Set the title, description and share picture once. Saroh tells you when the picture is too small for Facebook and LinkedIn, or too heavy for WhatsApp. Each site has its own sitemap for search.",
            chatLabel: `${rye.name}'s link shared in a WhatsApp chat, with its picture, title and description`,
            who: "Meera, in the family group",
            card: {
                title: `${rye.name} · Bakery on ${area}`,
                line: "Breads, buns and celebration cakes. Order by 8 pm, collect from 8 am.",
                url: rye.site,
            },
            message: `Ordering the ${said(bun.name)} for Sunday, who's in?`,
            time: "8:14 pm",
            panel: "Search and sharing",
            panelPage: "Home page",
            fields: [
                ["Page title", `${rye.name} · Bakery on ${area}`],
                [
                    "Description",
                    "Breads, buns and celebration cakes. Order by 8 pm, collect from 8 am.",
                ],
            ] as const,
            picture: "Share picture",
            warn: "Too small for Facebook and LinkedIn. Try one at least 1200 wide.",
            sitemap: ["Sitemap", `${rye.site}/sitemap.xml`] as const,
            google: ["Google Search Console", "Code added"] as const,
            bing: ["Bing Webmaster Tools", "Not added"] as const,
            phoneMore: "See search and sharing",
            phoneMoreMeta: "Sitemap",
        },

        ask: {
            more: "See the answer",
            title: "Or ask for the change.",
            at: RYE_MONDAY.christmas.at,
            body: `, closing up, ${owner} asks Claude to put the Christmas menu on a Christmas page. Connect Claude or ChatGPT to Saroh and ask for a change in your words. It saves a draft and sends you a publish request. Only you, or your reviewer, can publish it.`,
            link: "How AI apps work",
            label: `Claude, connected to ${rye.name}, adds the Christmas menu and saves it as drafts`,
            app: "Claude",
            connected: `connected to ${rye.name}`,
            ask: `Add the Christmas menu: ${plum.name.toLowerCase()}, ${plum.unit}, ${plum.price}, and a ${hamper.name.toLowerCase()}, ${hamper.price}. Put them on a Christmas page.`,
            answer: `Done, as drafts. The ${plum.name.toLowerCase()} and the ${hamper.name} are in Products, and a new Christmas page at ${RYE_MONDAY.christmas.page} shows both. Nothing changes on your site until you approve the publish request in Saroh.`,
            draft: "Christmas page · draft waits for you in Saroh",
            draftUrl: `${rye.site}${RYE_MONDAY.christmas.page}`,
        },

        tail: {
            moment: kavya
                ? `${kavya.customer} orders a birthday cake for Saturday on ${owner}'s own website, and it's in Orders before ${owner} looks up.`
                : "",
            momentLead: "Seen in a day:",
            momentAt: "10:00",
            momentLink: `See 10 am at ${rye.name}`,
            plan: open
                ? "The site, the shop and the booking page come with every plan, Free included. Your own domain comes with a paid plan."
                : "Free to start.",
            compare: "Compare plans",
            works: "Works with",
        },

        faq: [
            {
                q: "Do I edit the site when a price changes?",
                a: "No. Prices, products, classes, free times and hours are read from Saroh. Change them there and the site shows it.",
            },
            {
                q: "Can I use my own domain?",
                a: open
                    ? `Yes. Start at a free ${host.slice(1)} address and connect a domain you own with two records at your registrar. It's connected through www, and comes with a paid plan.`
                    : `Yes. Start at a ${host.slice(1)} address and connect a domain you own with two records at your registrar. It's connected through www.`,
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
                q: "Do my customers need a password?",
                a: "No. They sign in with a code. Their account is with your business on your site, not with Saroh.",
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
            note: open
                ? `Your ${host.slice(1)} address is free on every plan.`
                : "Free to start. No card needed.",
        },
        inTheApp: {
            /** On a phone, the steps and what follows fold behind this. */
            phone: "Help, every point and who uses it",
            everything: "Everything the website builder does",
            usedBy: "Used by",
            of: "of",
        },
    };
}

export type { LookWords, WebsiteWords };
