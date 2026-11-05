import type { Combo } from "../types";

export const invoiceWebDeveloper: Combo = {
    document: "invoice",
    trade: "web-developer",
    reviewed: false,
    lede: "Set up for web builds: signed-off milestones, hours or sprints, care plans, hosting and the licences you bought for the site. Fill it online, or download the file.",
    example: { number: "INV-0420" },
    tips: [
        {
            title: "Link each milestone to its sign-off",
            text: "Write the date the client approved the staging site beside the milestone line. Then a late query from their accounts team can be answered by pointing at that date.",
        },
        {
            title: "Keep hosting off the build invoice",
            text: "Send running costs on their own bill. A client who sees hosting folded into a big project fee will struggle to budget for it once the build is over.",
        },
        {
            title: "Log time in plain language",
            text: "'Fixed checkout tax bug, 3 hours' is something a shop owner understands. A ticket number or a branch name tells them nothing, and it invites a call you don't want.",
        },
    ],
    faqs: [
        {
            question: "When do I bill the final part if launch keeps slipping?",
            answer: "Tie the last payment to the site being ready, not to launch day. A client can wait months for their own content. Agree a date in the contract after which the final milestone falls due regardless of when they go live.",
        },
        {
            question: "How do I bill bugs found after launch?",
            answer: "Set a fixed period in your contract when faults in your own work are fixed for free. Show that work at nil on the bill if you want it seen. New requests dressed up as bugs get billed by the hour.",
        },
        {
            question: "Should a plugin renewal go through my invoice?",
            answer: "Only if you agreed to manage it. Show it at cost and name the renewal date, so nobody mistakes it for your fee. It's cleaner still if the licence sits on the client's card and in their own account.",
        },
        {
            question: "Can I switch off a site when a client won't pay?",
            answer: "Be careful, and check your contract and local law first. Taking down a live business can create more trouble than the debt. A written reminder, then pausing further work, is usually the safer way to start.",
        },
    ],
};
