/**
 * /features/ai-apps on saroh.tech: saroh.in's Connect page (boards FMDesk
 * and FMPhone2, DEC-221), one Claude chat at Thistlewick Bakery's closing
 * time. Every name, price and time comes from the world (`content/world.ts`);
 * tool names in the chat are the MCP server's own, as on saroh.in, without the ones for
 * what no Free business has (class packs, staff).
 *
 * What differs from saroh.in: Global's MCP address and sign-in, one person
 * running the business (no team, no reviewer, no roles), no plan named
 * (DEC-211), and Ask AI said plainly to be outside Free.
 */
import type { AiAppsWords } from "@saroh/marketing/feature-pages/ai-apps/words";

import { planWords } from "./plan-words";
import { THISTLEWICK_TUESDAY, WORLD } from "./world";

const bakery = WORLD.lead;
const item = (key: string) => {
    const found = bakery.items.find((i) => i.key === key);
    if (!found) throw new Error(`world: no item ${key}`);
    return found;
};
const box = item("holiday-box");
const truffle = item("truffle-cake");
const bun = item("cinnamon-bun");
const loaf = item("sourdough");
const holiday = THISTLEWICK_TUESDAY.holiday;
const owner = bakery.owner;

export function aiAppsWords({ plansOn }: { plansOn: boolean }): AiAppsWords {
    const plan = planWords(plansOn);
    return {
        name: "AI apps",
        title: { before: "Run Saroh from your own ", mark: "assistant." },
        lede: `Closing up at 4 pm, ${owner} asks Claude to add the holiday menu. Connect the assistant you already use and ask for your work in your own words. It can do only what you can do in Saroh, and nothing on your website goes live until you publish it.`,
        apps: "Works with Claude, ChatGPT and other AI apps.",
        secondary: "Connect your assistant",
        note: "Free to start. No card needed.",

        chat: {
            label: `A chat in Claude at 4:12 pm where ${owner} adds the holiday menu to ${bakery.name} as a draft product on a new holiday page and gets a publish request`,
            app: "Claude",
            connected: `Saroh · ${bakery.name}`,
            first: {
                at: holiday.at,
                ask: `Add the holiday menu: a ${box.name.toLowerCase()}, ${box.price}, beside the ${truffle.name.toLowerCase()}. Put them on a holiday page.`,
                steps: [
                    {
                        did: "Added a product",
                        what: `${box.name} · ${box.price}`,
                        tool: "create_product",
                        state: "Draft",
                    },
                    {
                        did: "Added a page",
                        what: `Holiday · ${holiday.page}`,
                        tool: "add_page",
                        state: "Draft",
                    },
                    {
                        did: "Asked you to publish",
                        what: `${bakery.name} website`,
                        tool: "preview_publish",
                        state: "Not published",
                    },
                ],
                answer: [
                    `Added the box to ${bakery.name} as a draft, so it's not on sale yet: `,
                    `${box.name}, ${box.price}`,
                    ", beside the ",
                    `${truffle.name}, ${truffle.price}`,
                    ". I've made a holiday page at ",
                    holiday.page,
                    " with both on it, in your website draft. I can't publish it: check the preview, then publish it yourself in Saroh. The link works for 24 hours.",
                ],
                link: "Open the publish request in Saroh",
            },
            cap: `An example chat, for ${bakery.name} (demo bakery). ${owner}, closing up on Tuesday 17 Nov.`,
            momentLink: `See 4 pm at ${bakery.name}`,
            phoneMore: "See the rest of the chat",
        },

        rule: {
            bold: "Which should you use?",
            text: "Ask AI is built into Saroh and asks before it changes anything, but it isn't part of Free. Your own assistant works on Free: connect it if you already live in Claude or ChatGPT, even on the bus.",
            link: "How Ask AI works",
        },

        land: {
            arriveMore: "What waits for you, and what changes at once",
            title: "And there it is, in Saroh.",
            lead: "Your assistant works on the same records as the rest of Saroh. New products wait as drafts. Website changes wait for you to publish.",
            products: {
                after: "After “Add the holiday menu”",
                when: "Products, at 4:12 pm",
                label: "Saroh's Products list with the new holiday box marked Draft",
                crumb: ["Sell", "Products"],
                title: "Products",
                count: "9 products",
                head: ["PRODUCT", "STATUS", "PRICE"],
                rows: [
                    {
                        key: box.key,
                        name: box.name,
                        state: "Draft",
                        price: box.price,
                        isNew: true,
                    },
                    {
                        key: truffle.key,
                        name: `${truffle.name} (${truffle.unit})`,
                        state: "Live",
                        price: truffle.price,
                    },
                    {
                        key: bun.key,
                        name: bun.name,
                        state: "Live",
                        price: bun.price,
                    },
                    {
                        key: loaf.key,
                        name: `${loaf.name} (${loaf.unit})`,
                        state: "Live",
                        price: loaf.price,
                    },
                ],
                where: "Downtown · Online",
                foot: "Draft: only you can see it. Open one to check the photo, then put it on sale.",
            },
            request: {
                after: "After “Put them on a holiday page”",
                when: "At 4:12 pm, one tap from the chat",
                label: `Saroh's Publish request screen: Claude prepared it, and ${owner} chooses Publish or Don't publish`,
                crumb: ["Website", "Publish request"],
                title: `Publish ${bakery.name}?`,
                rows: [
                    [
                        "Asked by",
                        `Claude prepared this, on ${owner}'s connection.`,
                        "17 Nov, 4:12 pm",
                    ],
                    ["Website", bakery.name, ""],
                    ["Open until", "18 Nov, 4:12 pm", ""],
                ],
                live: "Going live",
                liveWhat: `New page: Holiday, at ${holiday.page}`,
                preview: "Open the preview",
                note: "Publishing puts it live for everyone, now. Nothing happens until you choose.",
                buttons: ["Don't publish", "Publish"],
            },
            arrive: [
                {
                    title: "Products and services",
                    how: "Start as drafts",
                    draft: true,
                    body: "A new product is a draft, not on sale, unless you ask for it on sale. You check it in Products.",
                },
                {
                    title: "Bookings, orders, customers",
                    how: "Change at once",
                    draft: false,
                    body: "A new or moved booking, an order's status or a customer's details change straight away, and each change is listed in AI activity.",
                },
                {
                    title: "Your website",
                    how: "Waits for you",
                    draft: true,
                    body: "Pages, sections and blog posts are drafts. Your assistant can't publish: it hands you a link, and you choose Publish or Don't publish in Saroh.",
                },
            ],
        },

        compare: {
            more: "See the whole comparison",
            title: "Ask AI, or AI apps?",
            lead: "Both work on the same records. AI apps asks less before it acts, so here is the difference, plainly.",
            cols: [
                { name: "Ask AI", sub: "Built into Saroh" },
                { name: "AI apps", sub: "Claude, ChatGPT and other AI apps" },
            ],
            rows: [
                [
                    "Where you ask",
                    "At the top of every screen in Saroh",
                    "In the app you already use, on your phone or computer",
                ],
                [
                    "Language",
                    "Your own words",
                    "Whatever your assistant understands",
                ],
                [
                    "Changes",
                    "A card you confirm first, with Undo the same day",
                    "No card to confirm. Bookings, orders and customers change at once. Products and website changes are drafts, and it can remove sections and pages from your website draft. All listed in AI activity",
                ],
                [
                    "Answers show",
                    "The rows behind each answer, and which screens it read",
                    "What your assistant chooses to show",
                ],
                [
                    "To set up",
                    "Nothing. It's already there",
                    "One connector, one sign-in",
                ],
                [
                    "On Free",
                    "Not part of Free",
                    "Yes. Some apps need a subscription of their own",
                ],
            ],
        },

        paste: {
            lede: "Paste one address into your AI app.",
            copy: "Copy",
            copied: "Copied",
            failed: "Couldn't copy. The address is selected: copy it by hand.",
            guides: "Step-by-step for",
            claude: "Claude",
            chatgpt: "ChatGPT",
            other: "Another AI app",
        },

        connect: {
            id: "connect",
            title: "Connected in three moves.",
            lead: "Press Connect in Saroh Settings, under API and AI apps. About a minute, once, and it stays connected until you disconnect it.",
            address: "https://mcp.saroh.tech/mcp",
            moves: [
                {
                    where: "In Claude",
                    claude: true,
                    label: "Claude's custom connector form with the name Saroh and Saroh's address",
                    bar: ["Claude", "Connectors"],
                    title: "Press Connect in Saroh Settings.",
                    body: "It opens Claude's connectors, where Saroh is added. Or paste Saroh's address there yourself.",
                    link: {
                        label: "Open Claude's connectors",
                        href: "https://claude.ai/new#customize/connectors",
                    },
                },
                {
                    where: "In Saroh",
                    label: "Saroh's sign-in page opened from Claude",
                    title: "Sign in, as you always do.",
                    body: "Your assistant opens Saroh's own sign-in page. It never sees your password.",
                },
                {
                    where: "In Saroh",
                    label: "Saroh asks which businesses Claude may work with, then what it will be able to do",
                    title: "Pick the business, and allow it.",
                    body: "Tick one business, several or all of yours. Saroh shows what it may and may not do before you press Allow.",
                },
            ],
            form: {
                title: "Add a custom connector",
                name: ["Name", "Saroh"],
                addr: "Address",
                copy: "Copy",
                add: "Add",
            },
            signIn: {
                host: "accounts.saroh.tech",
                title: "Sign in to Saroh",
                email: ["Email", `${owner.toLowerCase()}@example.com`],
                go: "Continue",
                note: "The email you already use.",
            },
            consent: {
                title: "Which businesses should Claude work with?",
                all: "All my businesses",
                one: bakery.name,
                able: "It will be able to",
                can: [
                    "See your business: products, bookings, orders, customers, enquiries and your website",
                    "Make changes for you: add and edit products, bookings, orders and your website's draft",
                ],
                allow: "Allow",
            },
            chatgpt: {
                bold: "Use ChatGPT?",
                text: "Add Saroh the same way in ChatGPT's connectors, then sign in to Saroh when it asks.",
                link: "Connect ChatGPT",
            },
            of: "of",
        },

        can: {
            more: "See what else it can do",
            title: "What your assistant can do.",
            lead: "Ask in plain words. A few examples from each part of the business.",
            groups: [
                {
                    title: "Your day",
                    sub: "Bookings, orders, customers and enquiries.",
                    items: [
                        "See who's booked, for a day or a person",
                        "Make a booking, or move one",
                        "See orders and move them along",
                    ],
                },
                {
                    title: "What you sell",
                    sub: "Products, services, prices and hours.",
                    items: [
                        "Add a product, as a draft",
                        "Change a price or details",
                        "Set your opening hours",
                    ],
                },
                {
                    title: "Your website",
                    sub: "Always a draft, until you publish.",
                    items: [
                        "Add a page, or change one",
                        "Write a blog post draft",
                        "Remove a section or a page from the draft",
                    ],
                },
                {
                    title: "How it's going",
                    sub: "Read only. Nothing changes.",
                    items: [
                        "What's selling",
                        "Who still owes you",
                        "Customers who haven't come back",
                    ],
                },
            ],
            honest: "It can remove sections and pages from your website draft. They stay a draft until you publish, and Roll back site draft puts the draft back as it was.",
            all: "Every step it can take, on Developers",
        },

        cant: {
            title: "What it can't do.",
            lead: "It acts as you. Never more than you could do yourself.",
            stays: "Some things stay with you.",
            list: [
                "Publish your website",
                "Cancel a booking or refund a payment",
                "Touch billing or payment settings",
                "See sensitive customer notes, like health details",
            ],
            record: {
                title: "Everything it did, on record.",
                body: "Each change is listed under its connection in Settings › API and AI apps, kept for 90 days. Put the website draft back as it was, or disconnect it any time.",
            },
            panel: {
                more: "See its record",
                label: "Saroh's connection panel for Claude: what it changed, Roll back site draft and Disconnect",
                title: "Claude",
                sub: `Your connection · Connected by ${owner} (you)`,
                rows: [
                    [`Added a product: ${box.name}`, "4:12 pm"],
                    ["Added a page to the website draft: Holiday", "4:12 pm"],
                    ["Asked you to publish the website", "4:12 pm"],
                ],
                buttons: ["Roll back site draft", "Disconnect"],
            },
            foot: "What your assistant reads from Saroh goes to the company behind it, under its own terms. You can end a connection any time, and one ends by itself after 90 days unused.",
        },

        dev: {
            lead: "Someone building for you?",
            link: "API keys and webhooks are on Developers",
        },
        plan: {
            line: plan.aiAppsLine,
            compare: plan.compare,
        },

        faq: [
            {
                q: "Can my assistant publish my website?",
                a: "No. When you ask, it shows you what will go live and gives you a link into Saroh, where you choose Publish or Don't publish.",
            },
            {
                q: "Which apps can I use?",
                a: "Claude, ChatGPT and other AI apps. Claude and ChatGPT each have a short guide.",
            },
            {
                q: "What does it see?",
                a: "Only what you can see in the businesses you ticked, and never sensitive customer details. What it reads is sent to the company behind your assistant, under its own terms.",
            },
            {
                q: "What can't it do?",
                a: "It acts as you. It can't cancel bookings, give refunds or touch billing.",
            },
            {
                q: "Can one connection cover several businesses?",
                a: "Yes. Tick the ones it may use, and it names the business on every change it makes.",
            },
            {
                q: "How do I disconnect it?",
                a: "Open Settings › API and AI apps › AI assistants, choose the connection and press Disconnect from this business. A connection also ends after 90 days without use.",
            },
            {
                q: "Is this the same as Ask AI?",
                a: "Ask AI is built into Saroh. AI apps connects the assistant you already use. Both work on the same records.",
            },
            {
                q: "What is MCP?",
                a: "MCP (Model Context Protocol) is the open standard AI apps use to connect to other tools. Saroh has an MCP server, so an AI app that supports it can connect to your business after you sign in.",
            },
        ],
        askUs: {
            lead: "Something else?",
            label: "Ask us",
            href: "/contact",
            more: "All questions",
        },
        close: { title: "Do your Saroh work by asking." },
        inTheApp: {
            of: "of",
            /** On a phone, the steps and what follows fold behind this. */
            phone: "Help and setup",
        },
    };
}
