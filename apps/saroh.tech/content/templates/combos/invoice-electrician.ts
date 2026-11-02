import type { Combo } from "../types";

export const invoiceElectrician: Combo = {
    document: "invoice",
    trade: "electrician",
    reviewed: false,
    lede: "Bill electrical work the way it was done: points fitted, cable run, hours on site and the testing, with the test report's number printed beside the total.",
    example: {
        number: "INV-0412",
        issued: "2026-05-12",
        due: "2026-05-26",
        terms: "custom",
    },
    tips: [
        {
            title: "Bill testing as its own line",
            text: "Clients don't see testing happen. A separate line for it tells them that your meter readings and written report took real time, and were never an optional add-on.",
        },
        {
            title: "Print the test report number",
            text: "Years from now, a buyer's surveyor may ask for proof of the new circuits. An invoice carrying the report number lets the owner find both papers in one search.",
        },
        {
            title: "Count points, not just hours",
            text: "Eight new sockets is something a homeowner can walk round and count. It is easier to accept than a long run of labour hours spent behind a wall they can't see.",
        },
    ],
    faqs: [
        {
            question: "How do I bill a fault I spent hours tracing?",
            answer: "Give the fault finding its own line and say what was tested. A client who sees a two-minute fix may balk at the time, so explain that locating the bad joint was the actual work.",
        },
        {
            question:
                "The fault turned out to be an appliance. Can I still charge?",
            answer: "Yes, if your visit terms say the fee covers diagnosis. Note on the bill that the wiring tested fine and that the washing machine tripped the circuit. That finding is what they paid to learn.",
        },
        {
            question: "Should I send the test report with the invoice?",
            answer: "Attach it to the same email, or say when it follows. Some electricians hold back the paper until the balance clears. If you plan to, state that in your terms first, and check local rules on notification.",
        },
        {
            question: "How should I show a fuse board I bought for the job?",
            answer: "On its own line with the make and size, fitted. It's the largest single part on most upgrades, and a clear entry helps the client with any later warranty claim against the manufacturer.",
        },
    ],
    band: {
        title: "Tested, signed off, paid.",
        line: "Send the bill and report from the van, and take payment through your own link. 0% fees.",
    },
};
