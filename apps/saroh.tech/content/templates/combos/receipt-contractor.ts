import type { Combo } from "../types";

export const receiptContractor: Combo = {
    document: "receipt",
    trade: "contractor",
    reviewed: false,
    lede: "Confirm a stage payment on a building job: which stage it covers, how it reached you and how much of the contract still stands open.",
    example: {
        number: "RCT-0302",
        issued: "2026-04-22",
        due: "",
        terms: "custom",
        depositPaid: "2000",
        depositLabel: "Earlier stage payments",
        facts: [
            { label: "Paid on", value: "22 Apr 2026" },
            { label: "Paid by", value: "Bank transfer" },
            { label: "For", value: "Stage 2, walls and roof" },
        ],
        note: "Received with thanks against invoice INV-0302. Later stages stay due as agreed.",
    },
    tips: [
        {
            title: "Quote the invoice it settles",
            text: "On a long build, several sums land close together. Writing the invoice number on each receipt lets the owner and you match every transfer without digging through old bank statements.",
        },
        {
            title: "Write cash down the same hour",
            text: "Owners sometimes pay a crew foreman in notes at the gate. Issue a receipt before leaving the site, so neither side later relies on memory for how much changed hands.",
        },
        {
            title: "Show what's left on the contract",
            text: "A homeowner paying large sums over months loses track. Printing the remaining balance beneath this payment answers their next question and heads off a disagreement at final account.",
        },
    ],
    faqs: [
        {
            question: "Does a stage receipt mean the work was accepted?",
            answer: "No. It only proves money arrived. If you want the owner to sign off a stage as well, get that in a separate note, because a payment receipt says nothing about the quality of the walls.",
        },
        {
            question:
                "An owner's lender paid me directly. Who is the receipt for?",
            answer: "Name the owner as the customer, and add a line saying the funds came from their lender or a named payer. Send a copy to both, since each will need it for their own records.",
        },
        {
            question: "What if a client's cheque bounces after I issued one?",
            answer: "Tell them straight away, and mark that receipt as cancelled in your own files. Issue a new one when cleared funds arrive. For big stage sums, consider waiting for the bank to clear before you write anything.",
        },
    ],
    band: {
        title: "Every stage on paper.",
        line: "A receipt goes out when each payment lands through your own link, so the owner never has to ask. 0% fees.",
    },
};
