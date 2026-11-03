import type { TradeData } from "../types";

export const webDeveloper: TradeData = {
    reviewed: false,
    lede: "Made for web work: build milestones, hours or sprints, hosting and care plans, third-party costs and the moment a site goes live.",
    items: [
        {
            line: "Build milestone",
            billedBy: "A fixed fee per milestone",
            description: "Milestone 2: shop pages built",
            qty: "1",
            rate: "2000",
        },
        {
            line: "Development time",
            billedBy: "Per hour",
            description: "Development, hours",
            qty: "10",
            rate: "60",
        },
        {
            line: "Sprint",
            billedBy: "Per sprint or per week",
            description: "Two-week sprint",
            qty: "1",
            rate: "3000",
        },
        {
            line: "Care plan",
            billedBy: "Per month",
            description: "Updates and backups, months",
            qty: "3",
            rate: "80",
        },
        {
            line: "Hosting",
            billedBy: "Per month, or passed on at cost",
            description: "Hosting, months",
            qty: "12",
            rate: "15",
        },
        {
            line: "Plugins and licences",
            billedBy: "At cost, per year",
            description: "Paid plugin, yearly licence",
            qty: "1",
            rate: "100",
        },
    ],
    payment: {
        text: "Longer builds tend to be paid in milestones, so neither side carries all the risk. Care plans and hosting are billed apart from the build, because they carry on after launch.",
        points: [
            "A first payment before work starts",
            "A payment for each milestone signed off",
            "Monthly or yearly bills for care and hosting",
        ],
    },
    fields: [
        {
            name: "Milestone or sprint",
            why: "It ties the bill to work the client has seen and signed off.",
        },
        {
            name: "Site address",
            why: "An agency client may run many sites, and needs to see which one this is for.",
        },
        {
            name: "Who owns the accounts",
            why: "Say whose name the domain, hosting and licences are in, so handover is simple.",
        },
    ],
    example: {
        from: {
            name: "Your Web Studio",
            email: "hello@example.com",
            address: "Your address",
        },
        client: { name: "Client name" },
        facts: [
            { label: "Site", value: "shop.example.com" },
            { label: "Stage", value: "Milestone 2 of 4" },
        ],
        note: "Code rights pass to the client on final payment. Domain and hosting stay in the client's name.",
    },
};
