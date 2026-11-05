import type { Combo } from "../types";

export const invoiceGraphicDesigner: Combo = {
    document: "invoice",
    trade: "graphic-designer",
    reviewed: false,
    lede: "Set up for design jobs: concepts, layouts, extra rounds, licences and the line that says when the artwork becomes theirs. Fill it online, or download the file.",
    example: { number: "INV-0310" },
    tips: [
        {
            title: "Tie the rights to payment",
            text: "Write that ownership of the artwork passes once the bill is settled. It gives a slow payer a real reason to act, and it costs you nothing to add on every job.",
        },
        {
            title: "Count the rounds on the bill",
            text: "'Round 3 of 2 included' explains an extra charge better than any email. The client can look back at their own feedback and see why that line is there.",
        },
        {
            title: "Pass on licences as licences",
            text: "A font or stock photo bought for the client isn't your design time. Give it a line of its own at cost, and name whose account holds the licence afterwards.",
        },
    ],
    faqs: [
        {
            question: "Should I send final files before the invoice is paid?",
            answer: "It's safer not to. Send a watermarked or low-resolution proof for approval, then release the print-ready and source files when the money arrives. Say this in your first message, so holding files back never feels like a threat.",
        },
        {
            question: "How do I bill a logo that was never used?",
            answer: "You were hired for the work, not for the outcome. If the client drops the project, bill the stages you finished, as your agreement sets out. Name the concepts delivered, so finance can see what the money bought.",
        },
        {
            question: "Can I charge for source files separately?",
            answer: "Yes, as long as you said so before the job began. Some designers include the working files in the fee, and others treat them as an extra. Either way, give them a named line so nobody assumes they came free.",
        },
        {
            question: "How do I invoice a print job I arranged for the client?",
            answer: "Show the printer's cost on its own line, apart from your artwork fee. If you add a charge for managing the print run, name that too. Better still, ask the printer to bill the client direct when the run is large.",
        },
    ],
};
