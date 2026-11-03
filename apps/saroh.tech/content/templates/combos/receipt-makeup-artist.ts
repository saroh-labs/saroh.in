import type { Combo } from "../types";

export const receiptMakeupArtist: Combo = {
    document: "receipt",
    trade: "makeup-artist",
    reviewed: false,
    lede: "Confirm the retainer, the trial or the cash from a bridesmaid on the day, with the wedding date on it and the balance still to come clearly shown.",
    items: [
        {
            line: "Date retainer",
            billedBy: "Per booking",
            description: "Retainer for wedding on 14 Mar",
            qty: "1",
            rate: "200",
        },
        {
            line: "Trial paid",
            billedBy: "Per trial",
            description: "Bridal trial, paid on the day",
            qty: "1",
            rate: "100",
        },
        {
            line: "Bridesmaid paid direct",
            billedBy: "Per person",
            description: "Bridesmaid makeup, paid by guest",
            qty: "2",
            rate: "80",
        },
        {
            line: "Lashes on the day",
            billedBy: "Per set",
            description: "Strip lashes, added on the day",
            qty: "2",
            rate: "15",
        },
        {
            line: "Touch-up kit",
            billedBy: "Per kit",
            description: "Lipstick and powder touch-up kit",
            qty: "1",
            rate: "30",
        },
        {
            line: "Lesson",
            billedBy: "Per lesson",
            description: "One-to-one makeup lesson",
            qty: "1",
            rate: "75",
        },
    ],
    payment: {
        text: "Money reaches a makeup artist in pieces and from different people. A receipt for each piece shows who paid and what remains on the booking.",
        points: [
            "Retainer, trial and balance on separate receipts",
            "A guest paying direct gets her own",
            "The balance still due, in writing",
        ],
    },
    fields: [
        {
            name: "Wedding or event date",
            why: "A retainer months ahead means little later on, unless it names the day it held.",
        },
        {
            name: "Paid by",
            why: "The bride's mother and the guest on the day may both pay, so name each person.",
        },
        {
            name: "Balance still due",
            why: "A deposit receipt that hides this could read as settled in full.",
        },
    ],
    example: {
        number: "RCT-0001",
        issued: "2026-01-26",
        client: { name: "Client name", email: "client@example.com" },
        facts: [
            { label: "Paid on", value: "26 Jan 2026" },
            { label: "Paid by", value: "Bank transfer" },
            { label: "Event date", value: "14 Mar 2026" },
        ],
        note: "Thank you. Retainers hold your date and can't be refunded, as agreed in your quote.",
    },
    tips: [
        {
            title: "Name the event on a retainer receipt",
            text: "It may be a year before the day, and you may hold ten dates. Printing the event date beside the money means neither of you has to search old messages for it.",
        },
        {
            title: "Give a guest her own receipt",
            text: "When a bridesmaid pays you by phone in the hotel room, she may want proof for a friend splitting the cost. Her own small receipt also keeps your morning's takings clear.",
        },
        {
            title: "Record tips apart from the fee",
            text: "Someone may press extra cash on you after a good morning. Note it separately if your records need it, so a tip doesn't look like a higher price next time.",
        },
    ],
    faqs: [
        {
            question: "Is a retainer receipt proof that I'm booked?",
            answer: "It's proof that the money arrived. Your quote or booking terms hold the details of what it secures. Mention the date and the quote number on the receipt, so anyone reading can match the two.",
        },
        {
            question:
                "A guest gave me cash for two people. How do I write that?",
            answer: "Issue one receipt to the person who paid, with both names on the line and the total. Keep it the same morning. By evening, you'll struggle to recall who covered whose lashes.",
        },
        {
            question:
                "What do I write when a retainer is kept after a cancellation?",
            answer: "Your first receipt stands, so you don't need another. Send a brief note saying the booking is cancelled and the retainer kept, as your terms said. A credit note covers any part you return.",
        },
    ],
    band: {
        title: "Every part of the booking, on record.",
        line: "Take each payment through your own link, and send a receipt from your phone the same minute. 0% fees.",
    },
};
