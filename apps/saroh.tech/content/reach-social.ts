/**
 * /features/social, "Share and posts", on saroh.tech: saroh.in's Reach page
 * (boards FSDesk and FSPhone2, DEC-221) told with one cinnamon bun six-pack
 * at Thistlewick Bakery. Every name, price, time and address comes from the
 * world (`content/world.ts`); the words around them are this file's. Visit
 * counts are examples, and say so.
 *
 * What differs from saroh.in: captions in English (no Hinglish), no word
 * about Indian scripts, no plan on sale (DEC-211, so "Free until paid plans
 * open" and "Tell me when"), and the salon's cards wear a salon template's
 * look (`TEMPLATE_LOOKS`), since the Global seed sets no theme. The claim
 * switches shape the words as on saroh.in.
 */
import type {
    CardWordsSet,
    SocialWords,
} from "@saroh/marketing/feature-pages/social/words";

import { TEMPLATE_LOOKS, THISTLEWICK_TUESDAY, WORLD } from "./world";

const bakery = WORLD.lead;
const salon = WORLD.others[0];
const find = (b: typeof bakery, key: string) => {
    const found = b.items.find((i) => i.key === key);
    if (!found) throw new Error(`world: no item ${key}`);
    return found;
};
const six = find(bakery, THISTLEWICK_TUESDAY.featured);
/** The six-pack, in the words pages use (no "pack" in Global's words, DEC-099). */
const BOX = "box of six";
const cut = find(salon, "cut");
const cls = THISTLEWICK_TUESDAY.class;
const top = THISTLEWICK_TUESDAY.topSeller;
/** "$24.00" → "$19.20", at 20% off; the world writes money, so this writes it back. */
const off20 = (price: string) => {
    const n = Number(price.replace(/[^\d.]/g, ""));
    return `${price.replace(/[\d,.]+/, "")}${(n * 0.8).toFixed(2)}`;
};
const initials = (name: string) =>
    name
        .replace(/&/g, " & ")
        .split(/\s+/)
        .filter((w) => /^[A-Z&]/.test(w))
        .map((w) => w[0])
        .join("");
const maya = bakery.customers[0].name.split(" ")[0];
const mayaFull = bakery.customers[0].name;
const lucy =
    bakery.customers.find((c) => c.name.startsWith("Lucy"))?.name ?? "";
const handle = bakery.site.split(".")[0];
/** The salon template's gold beside its plum: the cards' band. */
const SALON_BAND = { bg: "41.6 54% 53.9%", fg: "286.7 39.1% 13.5%" };

const bakeryCard: CardWordsSet = {
    label: `${bakery.name} · Bakery`,
    name: six.name,
    photoLine: `${six.price} · ${BOX}`,
    tag: { price: six.price, unit: BOX },
    offer: {
        big: "20% off",
        was: six.price,
        now: off20(six.price),
        label: `${bakery.name} · this week only`,
    },
    simpleLine: `${six.price} · baked before we open`,
    mark: initials(bakery.name),
    web: bakery.site,
};
const salonCard: CardWordsSet = {
    label: `${salon.name} · Hair`,
    name: cut.name,
    photoLine: `${cut.price} · ${cut.unit}`,
    tag: { price: cut.price, unit: cut.unit },
    offer: {
        big: "20% off",
        was: cut.price,
        now: off20(cut.price),
        label: `${salon.name} · this week only`,
    },
    simpleLine: `${cut.price} · book a chair this week`,
    mark: initials(salon.name),
    web: salon.site,
};

const caption = `Cinnamon buns, soft, sticky and baked before we open. A ${BOX} is ${six.price}. Order for pick-up:`;

export function socialWords({
    everyPlan,
    posting,
    insights,
    askSocial,
}: {
    everyPlan: boolean;
    posting: boolean;
    insights: boolean;
    askSocial: boolean;
}): SocialWords {
    return {
        name: "Share and posts",
        title: {
            before: "Turn what you sell into a post ",
            mark: "in a minute.",
        },
        lede: "Press Share on a product, a class, an offer or your booking page. Saroh draws it as a ready post in your website's own colours, fonts and logo, writes the caption, and you post it from your own phone.",
        free: everyPlan
            ? "Free to share. Instagram, WhatsApp, Facebook."
            : "Instagram, WhatsApp, Facebook.",
        secondary: "Watch one post, start to finish",
        note: "Free to start. No card needed.",
        looks: {
            lead: { look: bakery.look, band: undefined },
            other: { look: TEMPLATE_LOOKS.salon, band: SALON_BAND },
        },
        cards: { lead: bakeryCard, other: salonCard },

        stage: {
            label: `The ${six.name.toLowerCase()} ${BOX} shared as four cards in ${bakery.name}'s look`,
            /** On a phone, the cards are cut; this opens them. */
            more: "See all four cards",
            product: `${six.name}, ${BOX}`,
            productNote: `${six.price} · Pastry · Sells online and at the counter`,
            phoneNote: `${six.price} · Pastry`,
            live: "Live",
            share: "Share",
            pick: "Pick a post",
            sizes: ["Post 4:5", "Square", "Story 9:16"],
            styles: {
                photo: "Photo",
                price: "Price tag",
                offer: "Offer",
                simple: "Simple",
            },
            picked: "Price tag",
            note: `Four cards from one product, in ${bakery.name}'s own colours and type. A card only shows what the item has: no live offer, no Offer card.`,
            of: "of",
        },

        salon: {
            title: "Same four cards. A salon's own look.",
            lead: `${salon.name} shares a ${cut.name.toLowerCase()}. The cards take its site's colours, type and rounder corners, here a salon template's plum and gold, read from the published site. Nothing on them is Saroh's.`,
            site: `${salon.name} · ${salon.site}`,
            phoneMore: `See all four in ${salon.name}'s look`,
            duo: [
                { name: bakery.name, kind: "bakery" },
                { name: salon.name, kind: "salon" },
            ],
        },

        worth: {
            askMore: "See what Ask AI says",
            title: "Share tells you what's worth posting.",
            lead: "Every morning it looks at what sold, your offers and your classes, and puts three ideas at the top. Ask AI can tell you too, and ends with the post worth making.",
            label: `Saroh's Social page for ${bakery.name} with Worth posting today`,
            small: "Share and posts",
            page: "Posts",
            pageLine:
                "Posts in your website's look, ready for Instagram, WhatsApp and Facebook.",
            newPost: "New post",
            head: "Worth posting today",
            headNote: "From what sold, your offers and your classes",
            make: "Make this post",
            ideas: [
                {
                    kind: "price",
                    name: six.name,
                    line: `Your top seller: ${top.sold} sold this week. Not posted yet.`,
                },
                {
                    kind: "offer",
                    name: "Weekend bakes ends Sunday",
                    line: "20% off till Sunday. A post today gives it two days.",
                },
                {
                    kind: "text",
                    name: `${cls.name}, ${cls.when.split(",")[0]}`,
                    line: `${cls.places - cls.booked} places left of ${cls.places}.`,
                },
            ],
            ask: {
                label: `Ask AI answers what sold most this week: cinnamon buns, ${top.sold} sold, read from Orders and Products`,
                title: "Ask AI",
                q: "What sold most this week?",
                a: `${six.name}: ${top.sold} sold this week.`,
                more: askSocial
                    ? "Your top seller, and it hasn't been posted yet."
                    : "Your top seller.",
                from: "Read from",
                sources: ["Orders", "Products"],
                follow: "Make a post about the cinnamon buns",
                plans: "",
            },
            phoneMore: "See the whole list",
            phoneMoreMeta: "Ask AI too",
            phoneAlso: `Also today: ${cls.name}, ${cls.when.split(",")[0]}, ${cls.places - cls.booked} places left of ${cls.places}.`,
        },

        story: {
            id: "bunbox",
            title: "One box of buns, from the counter to their feed.",
            lead: `Tuesday, just after one. ${bakery.owner} has ten minutes before the afternoon bake. She needs about four.`,
            of: "of",
            card: {
                at: "13:02",
                title: "She picks a card and a size.",
                body: "Photo, Price tag, Offer or Simple, as a post, a square or a story. Stories keep the words clear of the top and bottom, where Instagram and WhatsApp put their own bars.",
                another: "Try another look",
                seg: ["Post", "Square", "Story"],
                sizes: [
                    { size: "post", name: "Post", ratio: "4:5" },
                    { size: "square", name: "Square", ratio: "1:1" },
                    { size: "story", name: "Story", ratio: "9:16" },
                ],
            },
            caption: {
                at: "13:03",
                title: "The caption is already written.",
                body: "Short, or with the price. Change any word. The preview follows as you type, and your short link sits at the end so people land on the bun's own page.",
                product: `${six.name}, ${BOX}`,
                productNote: `Product · ${six.price} · live on your shop`,
                head: "Caption",
                done: "Done",
                kinds: ["Short", "With price"],
                on: "With price",
                text: caption,
                link: `${bakery.site}/s/t7c2`,
                note: 'Instagram shows the first 125 characters before "… more". Yours fits. The short link becomes "Link in bio" there.',
            },
            share: {
                at: "13:04",
                title: everyPlan ? "She shares it. Free." : "She shares it.",
                body: "Download the picture and copy the caption, or send it straight on WhatsApp or Facebook. You post from your own accounts, so there's nothing to connect and no password to give.",
                head: "Ready to share",
                download: ["Download image", "Then post it from Instagram"],
                copy: ["Copy caption", "With your short link at the end"],
                apps: ["WhatsApp", "Facebook"],
                phone: "On a phone, the caption is copied and your share sheet opens with the picture.",
            },
        },

        feed: {
            handle,
            initials: initials(bakery.name),
            caption,
            inBio: "Link in bio",
        },

        posted: {
            more: "See it in the feed",
            at: "13:05",
            title: "Posted. Back to the ovens.",
            label: `${bakery.name}'s post on Instagram, on a phone`,
            ticks: [
                "Image saved to your Downloads",
                "Caption copied, with your short link",
            ],
            buttons: [
                "Open Instagram",
                "Also send on WhatsApp",
                "Make another post",
            ],
            laterAt: "19:30",
            shared: "Shared",
            laterName: six.name,
            laterWhen: "Shared today · Instagram",
            visits: "11 visits",
            example: "Example",
            visitsNote:
                "Visits are people who opened your short link from the post. They show on the post in Social and on the bun's own page.",
        },

        own: {
            title: "Nothing to sell today? Say something.",
            lead: "Type a line, add your photo if you like, and pick the page it links to. Saroh draws it in your website's look. Your own posts are saved, so you can share them again.",
            label: "Your own post: the headline Open late on Friday, till 5 pm, drawn in the business's look",
            headline: "Open late on Friday, till 5 pm",
            caption:
                "We're open till 5 pm this Friday for late cake pick-ups. Come by.",
            ask: "What do you want to say?",
            hint: "Short reads best on a phone.",
            count: "30 / 90",
            photo: "Add your photo",
            linkTo: "Link to",
            linkPage: `Home · ${bakery.site}`,
            saved: "Draft saved ·",
            yours: "Your posts (3)",
            listTitle: "Your posts, ready to share again",
            list: [
                {
                    kind: "offer",
                    name: "Weekend bakes, 20% off",
                    when: "Shared today · WhatsApp, Instagram",
                    visits: "9 visits",
                    state: "Shared",
                },
                {
                    kind: "price",
                    name: six.name,
                    when: "Shared today · Instagram",
                    visits: "11 visits",
                    state: "Shared",
                },
                {
                    kind: "text",
                    fill: "accent",
                    name: "Open late on Friday",
                    card: "Open late on Friday, till 5 pm",
                    when: "Your own post · saved today",
                    state: "Draft",
                },
                {
                    kind: "text",
                    fill: "band",
                    name: "The holiday boxes are in",
                    when: "Shared 12 Nov · WhatsApp",
                    visits: "6 visits",
                    state: "Shared",
                },
                {
                    kind: "text",
                    fill: "band",
                    name: cls.name,
                    line: `${cls.when.split(",")[0]} · ${cls.price}`,
                    when: "Shared 8 Nov · Facebook",
                    visits: "9 visits",
                    state: "Shared",
                },
            ],
            foot: "Visits are people who opened your short link from a post. Numbers here are examples.",
            phoneMore: "See your posts",
            phoneMoreMeta: "Share again",
        },

        social: {
            id: "saroh-social",
            title: "Or let Saroh Social post it (add-on).",
            lead: "Saroh Social connects Instagram, your Facebook Page and Threads once. Then your posts go out at your good time, when most of your customers are online, and sit in your Calendar beside the day's pick-ups.",
            pill: "Saroh Social · an add-on",
            notYetTitle: "Saroh Social",
            notYet: "Not available yet",
            label: "Business Calendar, week of 16 to 22 November, with the Posts layer: the cinnamon bun post scheduled for Thursday at 7:30 pm",
            week: "16 to 22 Nov",
            views: ["Month", "Week"],
            legend: ["Posts", "Good time to post"],
            addPost: "+ Post",
            days: [
                ["MON", "16"],
                ["TUE", "17"],
                ["WED", "18"],
                ["THU", "19"],
                ["FRI", "20"],
                ["SAT", "21"],
                ["SUN", "22"],
            ],
            hours: ["11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm"],
            goodTime: "Good time",
            events: [
                { day: 1, at: 0, name: "Order collection", time: "11:00 am" },
                { day: 2, at: 1, name: "Order collection", time: "12:00 pm" },
                { day: 3, at: 3, name: mayaFull, time: "2:00 pm" },
                { day: 5, at: 0, name: "Order collection", time: "11:00 am" },
            ],
            goodDays: [1, 5, 6],
            posts: [
                { day: 2, past: false, kind: "simple" },
                { day: 3, past: false, kind: "price", on: true },
            ],
            postShort: "Buns",
            postAt: "7:30 pm",
            panel: {
                day: "Thu 19 Nov",
                meta: "3 things · 1 post",
                posts: "POSTS · 1",
                when: "7:30 pm · your good time",
                where: "Instagram, Facebook Page, Threads",
                edit: "Edit",
                now: "Post now",
                schedule: "Schedule a post on this day",
                bookings: "PICK-UPS · 2",
                rows: [
                    ["11:00 am", lucy, "Order collection"],
                    ["2:00 pm", mayaFull, "Order collection"],
                ],
            },
            points: [
                {
                    title: "Posts at your good time",
                    body: "The dashed line is when most of your customers are online. Drag a post to move it.",
                },
                {
                    title: "Likes beside visits",
                    body: "Each post shows its likes from Instagram next to the visits its link brought.",
                },
                {
                    title: "Your pick-ups in view",
                    body: "Posts sit in the same Calendar as your pick-ups, so a quiet Saturday shows at a glance.",
                },
            ],
            phoneMore: "See the Calendar week",
            phoneMoreMeta: "Good times",
            phoneWeek: `Thu 19 Nov has ${lucy}'s order collection at 11:00 am and ${maya}'s at 2:00 pm. Drag a post to move it. Each post shows its Instagram likes beside its visits.`,
        },

        tail: {
            plan: "Everyone is on Free for now.",
            compare: "Tell me when",
        },

        faq: [
            {
                q: "Do I have to connect my Instagram?",
                a: `No. Saroh makes the picture and the caption, and you share them from your own accounts, so there is nothing to connect and no password to give.${posting ? " Connecting is only for Saroh Social, if you want it to post for you." : ""}`,
            },
            {
                q: "Whose look are the cards in?",
                a: "Yours. Cards use your website's colours, fonts and logo, read from your published site. Nothing on them is Saroh's.",
            },
            {
                q: "Which things can I share?",
                a: "Products, services and classes, offers, blog posts and your booking page, once they are live on your site. Or make a post of your own with a headline, your photo or both.",
            },
            {
                q: "What sizes do I get?",
                a: "Post, square and story. Stories keep words clear of the top and bottom, so Instagram and WhatsApp never cover the name or price.",
            },
            {
                q: "Where does a post link to?",
                a: "To the item's live page on your site, where people can book or buy.",
            },
        ],
        askUs: {
            lead: "Something else?",
            label: "Ask us",
            href: "/contact",
            more: "All questions",
        },
        close: {
            title: "Something new? Share it today.",
            note: "Free to start. No card needed.",
        },
        inTheApp: {
            of: "of",
            /** On a phone, the steps and what follows fold behind this. */
            phone: "Help and setup",
        },
        insights,
    };
}
