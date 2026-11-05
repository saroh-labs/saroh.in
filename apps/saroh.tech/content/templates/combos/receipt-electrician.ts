import type { Combo } from "../types";

export const receiptElectrician: Combo = {
    document: "receipt",
    trade: "electrician",
    reviewed: false,
    lede: "Hand over proof of payment before you leave the job: fittings, hours and testing, with the serial number a warranty claim will ask for.",
    example: {
        number: "RCT-0412",
        issued: "2026-05-12",
        due: "",
        terms: "custom",
        facts: [
            { label: "Paid on", value: "12 May 2026" },
            { label: "Paid by", value: "Card, on site" },
            { label: "Fuse board serial", value: "SN 00412" },
        ],
        note: "Paid in full. Keep this with your test report TR-0412 as proof of the work.",
    },
    tips: [
        {
            title: "Record serial numbers",
            text: "An EV charger or a fuse board can fail long after you've moved on. A serial number here means the homeowner can claim directly from the maker and needn't call you.",
        },
        {
            title: "Keep the report and the money together",
            text: "An insurer asking after a small fire wants both documents. Mentioning the test report number on this slip means one piece of paper leads the owner straight to the other.",
        },
        {
            title: "Name the payer on rented homes",
            text: "A tenant may pay you on the doorstep, then claim the money back from their landlord. Printing the tenant's name and the address gives them exactly what that claim requires.",
        },
    ],
    faqs: [
        {
            question: "Can a receipt double as my test certificate?",
            answer: "No. A receipt proves money moved. A test report records readings and who took them, and it may have a set format where you work. Issue both, and let each one mention the other.",
        },
        {
            question:
                "A client paid for parts before I fitted them. Which receipt do they get?",
            answer: "Give one now for the parts payment and describe them as not yet installed. After fitting, send a second covering the labour. Two slips show plainly what was paid at each point of the job.",
        },
        {
            question: "How do I handle a card payment taken on my phone?",
            answer: "Your card reader may send its own slip, though it won't list a socket or a circuit. Send this as well, with the same amount and date, so the client knows what that charge bought.",
        },
    ],
};
