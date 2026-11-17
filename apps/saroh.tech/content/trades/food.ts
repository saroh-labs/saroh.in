import type { TradePage } from "./types";

/**
 * Food and shops beyond the lead "shops" page. Orders are taken at the
 * counter or written in by hand: ordering from the site waits for its switch
 * (SITE_SHOP), so no page here says a customer orders online.
 */
export const FOOD: TradePage[] = [
    {
        slug: "bakeries",
        name: "Bakeries",
        bar: "Bakery",
        longName: "Bakers",
        group: "food",
        way: "orders",
        at: "06:00",
        moment: "Four celebration cakes to finish today, and one says no nuts.",
        searchWords: "bakery baker cakes bread home baker patisserie",
        phrase: "bakery order software",
        seoTitle: "Bakery order software for cake and bread orders",
        seoDescription:
            "Bakery order software: cake orders with their collection day, allergies on every ticket, stock that counts down and numbered invoices.",
        headline: "Every cake order, and the day it's due.",
        sub: "Bakery order software for home bakers and small bakeries. Cake orders written down once with their collection day and the customer's allergy, the morning's bake counted, and an invoice when the office down the road orders forty rolls.",
        home: {
            label: "A baker's Home in Saroh at 6 am, an example: two cake orders due today, one with a nut allergy, and focaccia running short for the orders",
            clock: "6:02",
            place: "Bakery · before the ovens",
            needs: [
                {
                    icon: "warn",
                    title: "Order 118 is due at 11 am",
                    line: "Ella M. · lemon cake, no nuts",
                    warn: true,
                },
                {
                    icon: "stock",
                    title: "Focaccia is short for orders",
                    line: "6 ordered, 4 on the shelf",
                },
            ],
            today: [
                { at: "11:00", line: "Collect · Ella M. · lemon cake" },
                { at: "14:30", line: "Collect · Ravi P. · 24 cupcakes" },
                { at: "17:00", line: "Collect · Orla B. · birthday cake" },
            ],
        },
        changeTitle:
            "The problems every baker knows, and what Saroh does about each.",
        problems: [
            {
                feature: "orders",
                pain: "“Cake orders come in by message and I copy them into a notebook.”",
                title: "One list of orders, with the day each is due",
                body: "Write the order once, with what goes on the cake and when it's collected. Late ones are flagged, and you mark each one done.",
            },
            {
                feature: "customers",
                pain: "“She told me about the nut allergy in March, and I nearly forgot.”",
                title: "Allergies on the order, not in your head",
                body: "Note an allergy on the customer once. It shows in red on their orders and on today's list, every time they order.",
            },
            {
                feature: "products",
                pain: "“By ten I've sold out of sourdough and I'm still taking orders for it.”",
                title: "The morning's bake, counted",
                body: "Count what came out of the oven, and stock drops as orders go out. Home tells you when a loaf is short for the orders waiting on it.",
            },
            {
                feature: "billing",
                pain: "“The office that orders every Friday wants a proper invoice.”",
                title: "A numbered invoice for the regular order",
                body: "Make an invoice from the order, or write one with your own tax line. Record what's paid, and see what's still owed.",
            },
            {
                feature: "website",
                pain: "“People message to ask what cakes I do and what they cost.”",
                title: "Your cakes and prices on your own site",
                body: "Each product shows with its photos, its sizes and its price, read from the same list you sell from. A form takes custom cake requests into your contacts.",
            },
        ],
        starter: {
            kind: "products",
            rows: [
                { name: "Sourdough loaf", detail: "Baked daily" },
                { name: "Celebration cake", detail: "6, 8 or 10 inch" },
                { name: "Cupcakes", detail: "Box of 6 or 12" },
                { name: "Cinnamon buns", detail: "Weekends" },
            ],
        },
        faq: [
            {
                q: "Can I take an order for a date next month?",
                a: "Yes. Write the order with its collection day. It sits in your list until then, and shows as late if it's not marked done in time.",
            },
            {
                q: "Can I sell a cake in more than one size?",
                a: "Yes. Add sizes to a product, each with its own price and its own stock.",
            },
        ],
        closer: "Know tomorrow's bake before you go to bed.",
        related: ["shops", "cafes", "florists"],
    },
    {
        slug: "cafes",
        name: "Cafés",
        bar: "Café",
        longName: "Cafés",
        group: "food",
        way: "orders",
        at: "08:15",
        moment: "An office orders twelve coffees and a tray of pastries for ten.",
        searchWords: "cafe coffee shop coffee house tea room cafes",
        phrase: "café order software",
        seoTitle: "Café order software for coffee shops",
        seoDescription:
            "Café order software for coffee shops: counter orders, office orders with their time, stock you can count and numbered invoices for accounts.",
        headline: "The counter, the office order and the menu, together.",
        sub: "Café order software for coffee shops and tea rooms. Take orders at the counter, write in the office order that comes by phone, count the pastries before the rush, and invoice the businesses that run a tab.",
        home: {
            label: "A café's Home in Saroh at 7:45 am, an example: an office order for 10 am, croissants short for orders and an invoice overdue from a regular office",
            clock: "7:45",
            place: "Café · before opening",
            needs: [
                {
                    icon: "order",
                    title: "Order 342 is for 10 am",
                    line: "Harbour Lane office · 12 coffees, 10 pastries",
                },
                {
                    icon: "doc",
                    title: "Overdue from Kestrel Studio",
                    line: "Invoice 0057 · 12 days",
                    warn: true,
                },
            ],
            today: [
                { at: "10:00", line: "Collect · Harbour Lane office" },
                { at: "12:30", line: "Collect · Mina K. · lunch for 4" },
                { at: "15:00", line: "Collect · Joe T. · cake slices" },
            ],
        },
        changeTitle:
            "The problems every café knows, and what Saroh does about each.",
        problems: [
            {
                feature: "orders",
                pain: "“The office order came by phone, and it's on a napkin somewhere.”",
                title: "Orders by phone, in the same list as the counter",
                body: "Write it in with the time they'll collect. It sits beside today's counter orders, and a late one is flagged before anyone has to call.",
            },
            {
                feature: "products",
                pain: "“We run out of croissants at nine and don't know until someone asks.”",
                title: "Count the pastries, and see what's short",
                body: "Count what came in this morning. Each sale takes it off, and Home lists what's short for the orders already taken.",
            },
            {
                feature: "billing",
                pain: "“Three offices run a tab, and I chase each one at the end of the month.”",
                title: "One invoice for the month's orders",
                body: "Write a numbered invoice in your currency, with your own tax line. Record what's paid, and the overdue ones are listed on Home.",
            },
            {
                feature: "customers",
                pain: "“A regular has a dairy allergy and every new barista has to be told.”",
                title: "Regulars and their allergies, written once",
                body: "What they usually order and anything you must know, shown on their orders and today's list.",
            },
            {
                feature: "insights",
                pain: "“I don't know if the website brings anyone through the door.”",
                title: "See what sells, and who visits your site",
                body: "Insights counts your site's visits and enquiries beside your paid orders, and shows your best sellers.",
            },
        ],
        starter: {
            kind: "products",
            rows: [
                { name: "Flat white", detail: "Regular or large" },
                { name: "Almond croissant", detail: "Baked each morning" },
                { name: "Soup of the day", detail: "Lunch" },
                { name: "Office coffee tray", detail: "For 10" },
            ],
        },
        faq: [
            {
                q: "Can I keep a tab for an office?",
                a: "Yes. Record each order against the office as a customer, then write one invoice for the month and record the payment when it comes.",
            },
            {
                q: "Does it run my card machine?",
                a: "No. Take card payments on your own machine and record them in Saroh, so the order shows as paid.",
            },
        ],
        closer: "Start tomorrow with the office order already written.",
        related: ["bakeries", "shops", "gift-shops"],
    },
    {
        slug: "florists",
        name: "Florists",
        bar: "Florist",
        longName: "Florists",
        group: "food",
        way: "orders",
        at: "06:30",
        moment: "Three bouquets go out today, each with its card written.",
        searchWords: "florist flowers flower shop bouquets wedding flowers",
        phrase: "florist order software",
        seoTitle: "Florist order software for bouquets and events",
        seoDescription:
            "Florist order software: bouquet orders with the card's words and the day they're due, stems you can count and invoices for weddings and offices.",
        headline: "Every bouquet, its card and its day.",
        sub: "Florist order software for flower shops and studio florists. Each bouquet is written down with the words for its card and the day it's needed, the stems are counted, and the wedding or the office gets a numbered invoice.",
        home: {
            label: "A florist's Home in Saroh at 6:30 am, an example: a bouquet order due at 9, red roses short for orders, and an overdue invoice from a wedding",
            clock: "6:31",
            place: "Florist · at the market",
            needs: [
                {
                    icon: "stock",
                    title: "Red roses are short for orders",
                    line: "30 ordered, 18 in the cold room",
                    warn: true,
                },
                {
                    icon: "doc",
                    title: "Overdue from Hannah and Leo",
                    line: "Invoice 0023 · wedding flowers",
                },
            ],
            today: [
                { at: "09:00", line: "Collect · Priya S. · birthday bouquet" },
                { at: "12:00", line: "Collect · Marlowe Hotel · lobby vases" },
                { at: "16:00", line: "Collect · Ben A. · sympathy wreath" },
            ],
        },
        changeTitle:
            "The problems every florist knows, and what Saroh does about each.",
        problems: [
            {
                feature: "orders",
                pain: "“The words for the card were in a message I can't find now.”",
                title: "The card's words go on the order",
                body: "Write the bouquet, the day it's needed and what the card says, all on one order. Late ones are flagged, and you mark each one done.",
            },
            {
                feature: "products",
                pain: "“I promise a dozen red roses and find I have eight.”",
                title: "Stems counted against the orders",
                body: "Count what came from the market. Stock drops as orders go out, and Home tells you what's short for the orders still waiting.",
            },
            {
                feature: "customers",
                pain: "“He sends his mother flowers every year and I forget what she likes.”",
                title: "What each customer sends, and to whom",
                body: "Their past orders and your notes on one page, so the second order is quicker than the first.",
            },
            {
                feature: "billing",
                pain: "“A wedding is three invoices, and I lose track of what's paid.”",
                title: "Invoices for weddings and offices",
                body: "Write a numbered invoice for the wedding flowers, or one a month for the hotel's vases. Record each payment, and see what's still owed.",
            },
        ],
        starter: {
            kind: "products",
            rows: [
                { name: "Hand-tied bouquet", detail: "Small, medium, large" },
                { name: "Red roses", detail: "By the stem" },
                { name: "Sympathy wreath", detail: "Made to order" },
                { name: "Table centrepiece", detail: "For events" },
            ],
        },
        faq: [
            {
                q: "Can I write the message for the card on the order?",
                a: "Yes. Each order has a note for what the counter needs to know, like the card's words or a ribbon colour.",
            },
            {
                q: "Can I take an order for a wedding months ahead?",
                a: "Yes. Write it with its day and the customer, and invoice it when you're ready.",
            },
        ],
        closer: "Know tomorrow's bouquets before the market opens.",
        related: ["gift-shops", "bakeries", "boutiques"],
    },
    {
        slug: "boutiques",
        name: "Boutiques",
        bar: "Boutique",
        longName: "Boutiques",
        group: "food",
        way: "orders",
        at: "10:30",
        moment: "A dress in size 10 sells at the counter, and the count goes down.",
        searchWords: "boutique clothes clothing shop fashion dresses",
        phrase: "boutique stock software",
        seoTitle: "Boutique stock software for clothes by size",
        seoDescription:
            "Boutique stock software: every piece by size with its own count, sales at the counter, regulars and their sizes, and numbered invoices.",
        headline: "Every piece, in every size, counted.",
        sub: "Boutique stock software for clothes and accessory shops. Each piece is kept by size with its own count, a sale at the counter takes it off, and you know your regulars' sizes before they ask.",
        home: {
            label: "A boutique's Home in Saroh at 10 am, an example: an order put aside for a customer, a linen dress short in size 12, and today's collections",
            clock: "10:02",
            place: "Boutique · opening up",
            needs: [
                {
                    icon: "order",
                    title: "Order 77 hasn't been collected",
                    line: "Jo R. · put aside on Friday",
                },
                {
                    icon: "stock",
                    title: "Linen dress, size 12, is short",
                    line: "2 ordered, 1 on the rail",
                    warn: true,
                },
            ],
            today: [
                { at: "11:00", line: "Collect · Amara L. · wool coat, M" },
                { at: "13:30", line: "Collect · Jo R. · two scarves" },
                { at: "16:00", line: "Collect · Sian D. · silk top, 10" },
            ],
        },
        changeTitle:
            "The problems every boutique knows, and what Saroh does about each.",
        problems: [
            {
                feature: "products",
                pain: "“The spreadsheet says we have a medium. The rail says we don't.”",
                title: "Every size with its own count",
                body: "Add a piece once, with its sizes. Each size has its own price and stock, and a sale takes it off straight away.",
            },
            {
                feature: "orders",
                pain: "“I put a coat aside for someone, and a week later it's still there.”",
                title: "Put-aside orders that don't get forgotten",
                body: "Write it as an order for collection. Home tells you when it hasn't been collected.",
            },
            {
                feature: "customers",
                pain: "“A regular walks in and I can't remember her size.”",
                title: "Know your regulars' sizes",
                body: "What they've bought, in which size, what they've spent and your notes, on one page.",
            },
            {
                feature: "website",
                pain: "“People ask on Instagram if the dress comes in a 14.”",
                title: "The new pieces on your own site",
                body: "Each piece shows with its photos, its sizes and its price, from the same list you sell from. A struck-through price shows a sale.",
            },
        ],
        starter: {
            kind: "products",
            rows: [
                { name: "Linen dress", detail: "Sizes 8 to 16" },
                { name: "Wool coat", detail: "S, M, L" },
                { name: "Silk scarf", detail: "One size" },
                { name: "Leather belt", detail: "Two colours" },
            ],
        },
        faq: [
            {
                q: "Can each size have its own price?",
                a: "Yes. Each size has its own price, SKU and stock. Leave the price blank and it uses the product's.",
            },
            {
                q: "Can I bring in my stock list?",
                a: "Yes. Import your products from a CSV, then count them on the shelf.",
            },
        ],
        closer: "Open tomorrow knowing what's on every rail.",
        related: ["gift-shops", "shops", "florists"],
    },
    {
        slug: "gift-shops",
        name: "Gift shops",
        bar: "Gift shop",
        longName: "Gift shops",
        group: "food",
        way: "orders",
        at: "11:00",
        moment: "A hamper is made up for Friday, and the last two candles go in it.",
        searchWords: "gift shop gifts hampers cards homeware stationery",
        phrase: "gift shop stock software",
        seoTitle: "Gift shop stock software for small shops",
        seoDescription:
            "Gift shop stock software: hundreds of small things counted, hamper orders with their day, regulars remembered and numbered invoices.",
        headline: "A shop of small things, all counted.",
        sub: "Gift shop stock software for card, homeware and hamper shops. Hundreds of small things are counted as they sell, made-up hampers are orders with their day, and busy weeks before the holidays stay in hand.",
        home: {
            label: "A gift shop's Home in Saroh at 9:30 am, an example: a hamper order due Friday, candles short for orders and today's collections",
            clock: "9:31",
            place: "Gift shop · stock check",
            needs: [
                {
                    icon: "stock",
                    title: "Fig candles are short for orders",
                    line: "3 ordered, 2 on the shelf",
                    warn: true,
                },
                {
                    icon: "order",
                    title: "Order 205 is due on Friday",
                    line: "Tessa W. · thank-you hamper",
                },
            ],
            today: [
                { at: "10:30", line: "Collect · Noor A. · gift wrapped" },
                { at: "14:00", line: "Collect · Dale & Sons · 6 hampers" },
                { at: "16:30", line: "Collect · Kit B. · cards and frame" },
            ],
        },
        changeTitle:
            "The problems every gift shop knows, and what Saroh does about each.",
        problems: [
            {
                feature: "products",
                pain: "“We stock four hundred little things and I count them by eye.”",
                title: "Every little thing, with its count",
                body: "Import your products from a CSV, then add photos and counts. Each sale takes one off, and the list shows what to order again.",
            },
            {
                feature: "orders",
                pain: "“A company wants six hampers for Friday, and Friday is our busiest day.”",
                title: "Made-up orders with their day",
                body: "Write the hamper order once, with what goes in and when it's collected. Home lists what's short for it, so you can reorder in time.",
            },
            {
                feature: "billing",
                pain: "“The company wants an invoice for the hampers before they'll pay.”",
                title: "A numbered invoice for business orders",
                body: "Make an invoice from the order, in your currency. Record the payment when it lands.",
            },
            {
                feature: "insights",
                pain: "“I can't tell what sold in the run-up to the holidays.”",
                title: "What sold, and when",
                body: "Insights shows your best sellers with units and money, so next year's order is easier to plan.",
            },
        ],
        starter: {
            kind: "products",
            rows: [
                { name: "Scented candle", detail: "Three scents" },
                { name: "Greeting cards", detail: "By the card" },
                { name: "Thank-you hamper", detail: "Made to order" },
                { name: "Photo frame", detail: "Two sizes" },
            ],
        },
        faq: [
            {
                q: "Can I put many products in at once?",
                a: "Yes. Import them from a CSV with their names and prices, then add photos and counts.",
            },
            {
                q: "Can a hamper take stock from what's in it?",
                a: "Write the hamper as an order of the things that go in it, and each one comes off the shelf as it goes out.",
            },
        ],
        closer: "Go into the holidays knowing what's on the shelf.",
        related: ["boutiques", "florists", "shops"],
    },
];
