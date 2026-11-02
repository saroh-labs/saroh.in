import type { Combo } from "../types";

export const estimateCleaner: Combo = {
    document: "estimate",
    trade: "cleaner",
    reviewed: false,
    lede: "For places you haven't seen yet, or can't judge from a photo: a move-out, a cluttered home, an office after a refit. Give a likely figure and confirm it on the day.",
    items: [
        {
            line: "Walk-through",
            billedBy: "Per visit",
            description: "Walk-through before the job",
            qty: "1",
            rate: "20",
        },
        {
            line: "Cleaners on site",
            billedBy: "Per cleaner, per hour",
            description: "Team hours, likely 2 cleaners",
            qty: "12",
            rate: "20",
        },
        {
            line: "Carpets",
            billedBy: "Per room",
            description: "Carpet cleaning, rooms",
            qty: "3",
            rate: "40",
        },
        {
            line: "Builders' dust",
            billedBy: "Per room, if found",
            description: "Dust removal after refit, rooms",
            qty: "4",
            rate: "30",
        },
        {
            line: "Rubbish removal",
            billedBy: "Per load",
            description: "Rubbish removal, loads",
            qty: "1",
            rate: "60",
        },
        {
            line: "Materials",
            billedBy: "An allowance",
            description: "Specialist products, allowance",
            qty: "1",
            rate: "40",
        },
    ],
    payment: {
        text: "Nothing is due yet. Agree that the figure is confirmed once you've seen the property, and say if the real hours will be billed, or the figure treated as a fixed price.",
        points: [
            "Nothing due before the visit",
            "Final figure confirmed at the walk-through",
            "Paid on the day, or by invoice for an agent",
        ],
    },
    fields: [
        {
            name: "What you were told",
            why: "Note the rooms and condition as described, because the figure rests on that description.",
        },
        {
            name: "Size of team",
            why: "Two cleaners for six hours and one for twelve can be the same cost, so explain it.",
        },
        {
            name: "Water and power",
            why: "An empty rental may have neither turned on, and you can't clean without them.",
        },
    ],
    example: {
        number: "EST-0107",
        client: { name: "Client name", address: "6 Harbour View" },
        facts: [
            { label: "Job", value: "End-of-tenancy clean" },
            { label: "Assumes", value: "3 bedrooms, no pets" },
        ],
        note: "Based on the photos sent. Confirmed at the walk-through.",
        termsText:
            "This is an estimate, not a fixed price. It's based on the photos you sent. If the property needs more time, we will tell you before we start.",
    },
    tips: [
        {
            title: "Write what the photos showed",
            text: "People send pictures of their tidiest room. Say that the figure rests on what you saw, and ask to see the oven and the bathroom before you commit to any number.",
        },
        {
            title: "Agree who decides on the day",
            text: "If a tenant lets you in but the agent's paying, ask who can approve extra hours. Otherwise you'll be left standing in a kitchen with the phone ringing out.",
        },
        {
            title: "Price the mess you can't predict",
            text: "Mould, pet hair and builders' dust are the usual surprises. Give each a per-room line, marked as only if found, so an extra charge reads like something they saw coming.",
        },
    ],
    faqs: [
        {
            question: "Should I visit before giving a cleaning estimate?",
            answer: "For a large or unusual job, yes, and a short video call can do for a small flat. Say if the visit is free or comes off the final bill. Figures made without seeing the place are where most disputes start.",
        },
        {
            question:
                "What if the home is far dirtier than the customer described?",
            answer: "Stop before you begin, take photos, and give the new figure. They can agree, reduce what you clean, or cancel, paying for the trip if you said so. Don't work on and hope to argue it afterwards.",
        },
        {
            question: "How do I estimate an office clean by floor area?",
            answer: "Measure the floor, then count the things that really take time: desks, toilets, kitchens and glass. Two offices of the same size can differ a lot. List those counts, so the client sees what the figure was built on.",
        },
        {
            question:
                "Do I estimate differently for a hoarded or neglected home?",
            answer: "Yes. Always see it first, and take care over how you word things, as the person may feel ashamed. Work in stages, each with its own figure and a stopping point. Note any sharp items or hazards you may need help with.",
        },
    ],
    band: {
        title: "No surprises at the door.",
        line: "Send the estimate from your phone after a walk-through, and let the client approve it online before you start.",
    },
};
