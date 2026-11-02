import type { Combo } from "../types";

export const estimateElectrician: Combo = {
    document: "estimate",
    trade: "electrician",
    reviewed: false,
    lede: "Give a first figure for a rewire or a new circuit before the floorboards are up, with hours and cable marked as rough until the old wiring is seen.",
    example: {
        number: "EST-0412",
        issued: "2026-04-14",
        due: "2026-05-14",
        terms: "custom",
        facts: [
            { label: "Property", value: "6 Mill Street" },
            { label: "Survey", value: "Visual only, power left on" },
        ],
        termsText:
            "Rough figure from a visual check only. Cable runs and hours may change once floors are lifted. We will contact you before any added work is done.",
        note: "",
    },
    tips: [
        {
            title: "Say how much you could inspect",
            text: "A look at the board and a few sockets tells you little about what lies inside the walls. State that the survey was visual, so hidden problems aren't read as your mistake.",
        },
        {
            title: "Separate making good from wiring",
            text: "Chasing walls leaves channels behind. Say plainly whether you fill them or a plasterer does, because homeowners picture a finished room when they read a figure for a rewire.",
        },
        {
            title: "Give cable as a range of metres",
            text: "Nobody measures a route through an unknown ceiling exactly. Writing thirty to fifty metres shows your reasoning, and the final bill will not look like a sudden new charge.",
        },
    ],
    faqs: [
        {
            question: "Can I estimate a rewire without lifting floorboards?",
            answer: "Yes, as long as you label it clearly. Count rooms and points, allow for the likely routes, and warn that old junction boxes or damaged joists can push hours up once you actually get underneath.",
        },
        {
            question: "What if I find unsafe wiring while pricing the job?",
            answer: "Tell the owner straight away and put it in writing, even if they never hire you. Note the risk on the estimate as a separate item, so the warning stands apart from any sales figure.",
        },
        {
            question: "Should an EV charger have its own figure?",
            answer: "Yes. Whether the supply can take the load is unknown until you check, and a supplier may be involved. List the charger, the cable run and any board work apart, so each can move alone.",
        },
    ],
    band: {
        title: "Before the boards come up.",
        line: "Send a rough figure today, and turn it into a firm quote after the survey. 0% fees.",
    },
};
