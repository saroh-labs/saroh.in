import type { Combo } from "../types";

export const quoteSalon: Combo = {
    document: "quote",
    trade: "salon",
    reviewed: false,
    lede: "A firm price for group bookings, wedding parties and corporate grooming days, with the chairs you'll hold, the stylists needed and the deposit that holds them.",
    items: [
        {
            line: "Bridal hair",
            billedBy: "Per person",
            description: "Bride's hair, up-do",
            qty: "1",
            rate: "120",
        },
        {
            line: "Party hair",
            billedBy: "Per person",
            description: "Party hair, people",
            qty: "5",
            rate: "60",
        },
        {
            line: "Hair trial",
            billedBy: "Per trial",
            description: "Hair trial, 1 hour",
            qty: "1",
            rate: "60",
        },
        {
            line: "Manicures",
            billedBy: "Per person",
            description: "Party manicures, people",
            qty: "6",
            rate: "30",
        },
        {
            line: "Closed salon hire",
            billedBy: "Per hour before opening",
            description: "Salon closed for your party, hours",
            qty: "2",
            rate: "100",
        },
        {
            line: "Stylist on location",
            billedBy: "Per stylist, per hour",
            description: "Stylist at the venue, hours",
            qty: "4",
            rate: "50",
        },
    ],
    example: {
        number: "Q-0001",
        issued: "2026-01-19",
        due: "2026-02-02",
        depositPlan: "30",
        facts: [
            { label: "Booking date", value: "14 Mar" },
            { label: "Chairs held", value: "3, from 8:00 am" },
        ],
        termsText:
            "A 30% deposit holds the chairs. Numbers can change until 14 days before. After that, we charge for the people booked.",
    },
    tips: [
        {
            title: "Say how many chairs you're holding",
            text: "A large booking blocks out your whole Saturday morning. Write the number of chairs and the hours, so the client sees what the deposit is really protecting.",
        },
        {
            title: "Fix a date for the final count",
            text: "Groups shrink and grow. Choose the date after which the count is final, and bill for whoever was on it. It's the line that protects your stylists' diaries most.",
        },
        {
            title: "Name services, not just people",
            text: "Six people could mean six blow-dries or six up-dos, and those take very different times. Write what each person is having, or show a clear limit per person.",
        },
    ],
    faqs: [
        {
            question: "How far ahead should a salon quote for a wedding party?",
            answer: "As soon as they ask. Then hold the chairs only once the deposit arrives. A quote open for two weeks gives a bride time to decide, without blocking a busy Saturday that someone else could book.",
        },
        {
            question:
                "Can I charge more for work at the venue than in the salon?",
            answer: "Yes, if your quote shows why. Taking a stylist out of the salon costs you their hours, the travel and any clients you turn away. A clear per-hour line explains that better than a higher per-head price.",
        },
        {
            question:
                "Do I need to patch test a whole party quoted for colour?",
            answer: "Your own rules and insurer's terms decide that. If you test, build in time and name the date on the quote. Everyone having colour should know before the day, so nobody's turned away at the door.",
        },
        {
            question:
                "A company wants a grooming day for staff. What do I quote?",
            answer: "A flat day rate with a limit on people, or a per-person rate with a minimum. Add travel if you go to them, and any tax number they ask for. Ask who pays for extras such as products.",
        },
    ],
};
