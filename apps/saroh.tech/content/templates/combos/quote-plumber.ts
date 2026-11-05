import type { Combo } from "../types";

export const quotePlumber: Combo = {
    document: "quote",
    trade: "plumber",
    reviewed: false,
    lede: "A fixed price for planned work, like a bathroom refit or a new boiler: the exact models, the days on site, stage payments and what isn't covered.",
    items: [
        {
            line: "Boiler",
            billedBy: "Per unit, named model",
            description: "Combi boiler, named model",
            qty: "1",
            rate: "1200",
        },
        {
            line: "Fitting",
            billedBy: "A fixed fee",
            description: "Remove old boiler and fit new",
            qty: "1",
            rate: "900",
        },
        {
            line: "Radiators",
            billedBy: "Per radiator",
            description: "Replace radiators",
            qty: "4",
            rate: "150",
        },
        {
            line: "Bathroom suite",
            billedBy: "Per set",
            description: "Basin, toilet and bath",
            qty: "1",
            rate: "1000",
        },
        {
            line: "Bathroom labour",
            billedBy: "Per day",
            description: "Bathroom fit, days",
            qty: "4",
            rate: "300",
        },
        {
            line: "Waste",
            billedBy: "A flat fee",
            description: "Take away the old suite",
            qty: "1",
            rate: "100",
        },
    ],
    payment: {
        text: "Larger jobs mean buying parts up front. Put the deposit on the quote to cover them, and link the rest to clear points in the work, such as first fix.",
        points: [
            "A deposit to order the boiler or suite",
            "A stage payment after first fix",
            "Balance when it's tested and handed over",
        ],
    },
    fields: [
        {
            name: "Named models",
            why: "A named tap or boiler can't be quietly swapped, by you or by the customer's memory.",
        },
        {
            name: "Start date and days on site",
            why: "Families need to know how long they'll be without a bathroom.",
        },
        {
            name: "Warranty and sign-off",
            why: "Say what's guaranteed, for how long, and which paperwork they'll get at the end.",
        },
    ],
    example: {
        number: "Q-0211",
        client: { name: "Client name", address: "Billing address" },
        facts: [
            { label: "Job address", value: "27 Larch Road" },
            { label: "On site", value: "From 15 Jun, 5 days" },
        ],
        note: "Boiler carries the maker's warranty once registered.",
        termsText:
            "Price covers the parts and work listed. Tiling and decorating aren't included. Hidden faults found once work begins are priced first and agreed with you.",
    },
    tips: [
        {
            title: "Name the exact parts",
            text: "A homeowner chooses a boiler by the brochure and remembers it differently. Writing the maker and model number gives both of you something fixed to point at on the fitting day.",
        },
        {
            title: "Draw the line at the tiles",
            text: "On a bathroom, say where plumbing stops and tiling, plastering or electrics begin. Those gaps are where a fixed price turns into a row, especially when a tiler is booked separately.",
        },
        {
            title: "Leave a way out for hidden faults",
            text: "You can fix a price for what you can see. Add one sentence saying that rotten boards or a failed pipe found later are priced first, then agreed before you go on.",
        },
    ],
    faqs: [
        {
            question: "What if the customer buys their own taps or suite?",
            answer: "Quote your labour only, and say that the parts are theirs. Add that any fault in what they bought, or a return visit because it arrived damaged, is billed. Ask them to have everything on site before your start date.",
        },
        {
            question: "How long can I hold a boiler price on a quote?",
            answer: "Only as long as your supplier holds theirs. Ask them, then set your valid-until date to match. If a homeowner takes two months to decide, a short line saying parts are re-priced protects you from any increase.",
        },
        {
            question: "Should my quote mention certificates or inspections?",
            answer: "If the work requires them where you are, yes. Say which paperwork the customer will get and who arranges it, along with any fee. Rules for gas and building work vary, so check your local requirements before you write this line.",
        },
        {
            question:
                "A landlord wants one price for the same job across several flats. Can I do that?",
            answer: "Yes, if you've seen them or they truly match. Quote a per-flat price, and list each address. Say that a flat with different pipework or poor access will be priced separately, so one odd flat doesn't eat your margin.",
        },
    ],
};
