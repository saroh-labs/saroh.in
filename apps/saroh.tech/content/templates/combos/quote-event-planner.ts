import type { Combo } from "../types";

export const quoteEventPlanner: Combo = {
    document: "quote",
    trade: "event-planner",
    reviewed: false,
    lede: "A fixed fee for the planning you'll do, what's in scope and how many meetings it covers, with supplier costs set out as separate from your price.",
    items: [
        {
            line: "Full planning",
            billedBy: "Flat fee per event",
            description: "Full planning, booking to event day",
            qty: "1",
            rate: "2000",
        },
        {
            line: "Client meetings",
            billedBy: "Number included",
            description: "Planning meetings, 6 included",
            qty: "1",
            rate: "0",
        },
        {
            line: "Added meetings",
            billedBy: "Per meeting",
            description: "Further meetings, if wanted",
            qty: "2",
            rate: "75",
        },
        {
            line: "Site visit and layout",
            billedBy: "Per venue",
            description: "Site visit and floor plan",
            qty: "2",
            rate: "150",
        },
        {
            line: "On-the-day team",
            billedBy: "Per person, per day",
            description: "Coordinator and one assistant",
            qty: "2",
            rate: "400",
        },
        {
            line: "Rehearsal",
            billedBy: "Per rehearsal",
            description: "Run-through the evening before",
            qty: "1",
            rate: "200",
        },
    ],
    example: {
        number: "Q-0001",
        issued: "2026-01-19",
        due: "2026-02-09",
        depositPlan: "30",
        termsText:
            "Fee covers the work listed. Supplier costs are not included and are agreed separately. 30% books the date, 40% is due 60 days before, and the rest 14 days before.",
    },
    tips: [
        {
            title: "Write down what's out of scope",
            text: "Guest travel, invitations and speech writing tend to land on the planner unless you say otherwise. A short list of what you won't do saves weeks of small favours.",
        },
        {
            title: "Limit the meetings and the revisions",
            text: "A client may want to meet every week and redraw the floor plan five times. Say how many of each the fee includes, then price the rest on a line they can see.",
        },
        {
            title: "Date the stage payments to your risk",
            text: "Set each payment date before you must commit to a supplier. That way you never put your own money into a marquee for an event that could still be called off.",
        },
    ],
    faqs: [
        {
            question: "Should I quote a flat fee or a percent of the budget?",
            answer: "A flat fee is easy to explain and doesn't reward spending more. A percent grows with bigger events, but needs a clear definition of the budget it's based on. Whichever you use, put the amount on the quote.",
        },
        {
            question:
                "What if the guest count doubles after the quote is accepted?",
            answer: "Say at what number your fee changes, such as above 150 guests. Below that the fee stands. Above it, a new line reflects the added staff and time, so you aren't arguing about it in the final month.",
        },
        {
            question: "Who signs supplier contracts on a quoted event?",
            answer: "State it on the quote. If the client signs direct, they carry the supplier's terms. If you sign, you carry the risk and you'll need the money before each deposit falls due, so price accordingly.",
        },
        {
            question:
                "How do I word an event that may be cancelled for bad weather?",
            answer: "Separate your planning fee, which is earned as work is done, from each supplier's cancellation terms. Suggest the client asks about event insurance. Set out what stays payable at each date before the event.",
        },
    ],
    band: {
        title: "One fee. A clear scope. No small favours.",
        line: "Send the quote, take the booking stage through your own payment link and start planning. 0% fees.",
    },
};
