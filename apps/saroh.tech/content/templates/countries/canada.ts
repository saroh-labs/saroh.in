import type { CountryData } from "../types";

const RC4022 = {
    name: "RC4022, General Information for GST/HST Registrants, CRA",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html",
};
const ITC = {
    name: "Input tax credits, CRA",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit.html",
};
const CALCULATOR = {
    name: "GST/HST calculator and rates, CRA",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html",
};
const CHECKED = "2026-11-02";

export const canada: CountryData = {
    reviewed: false,
    lede: "Invoices and quotes in Canadian dollars, with the GST or HST line set by province and a place for your registration number. Check the source links on this page before you rely on them.",
    paper: "letter",
    dateLocale: "en-GB",
    facts: [
        {
            label: "Tax number",
            value: "A 9-digit business number, the letters RT, then a 4-digit account number.",
            source: RC4022,
            checkedOn: CHECKED,
        },
        {
            label: "HST provinces",
            value: "New Brunswick, Newfoundland and Labrador and Prince Edward Island 15%, Nova Scotia 14%, Ontario 13%.",
            source: CALCULATOR,
            checkedOn: CHECKED,
        },
        {
            label: "GST elsewhere",
            value: "5%. The same table shows a provincial rate on top in British Columbia 7%, Manitoba 7%, Saskatchewan 6% and Quebec 9.975%.",
            source: CALCULATOR,
            checkedOn: CHECKED,
        },
        {
            label: "Under $100",
            value: "Your business or trading name, the invoice date and the total.",
            source: ITC,
            checkedOn: CHECKED,
        },
        {
            label: "$100 to $499.99",
            value: "Adds your GST/HST registration number, and the tax charged or a statement that the price includes it.",
            source: ITC,
            checkedOn: CHECKED,
        },
        {
            label: "$500 or more",
            value: "Adds the buyer's name, a brief description and the terms of payment.",
            source: ITC,
            checkedOn: CHECKED,
        },
        {
            label: "The tax line",
            value: "Show that the total includes the tax, or the tax separately, or the rate. For HST, show the total rate, not the federal and provincial parts.",
            source: RC4022,
            checkedOn: CHECKED,
        },
        {
            label: "Small supplier",
            value: "$30,000 or less of worldwide taxable supplies, in a single quarter and over the last four quarters, with associates' revenue counted.",
            source: RC4022,
            checkedOn: CHECKED,
        },
        {
            label: "Keeping invoices",
            value: "Usually six years from the end of the year they relate to.",
            source: RC4022,
            checkedOn: CHECKED,
        },
        {
            label: "Heading",
            value: "Usually the word Invoice. The CRA lists what must appear, not a heading. Check with the CRA if you're unsure.",
            general: true,
        },
        {
            label: "Late payment",
            value: "Set by your contract and provincial law. Check with your province or a legal adviser before you charge it.",
            general: true,
        },
    ],
    payment: {
        text: "State your terms on every bill from the start: once a sale reaches $500 the CRA's chart lists them. Say which province's tax you charged, so a client in another province can see why the rate looks different.",
        points: [
            "Print the due date beside the terms",
            "List e-transfer, card link or cheque details",
            "Put any interest on overdue bills in your contract",
        ],
    },
    fields: [
        {
            name: "GST/HST registration number",
            why: "A registered seller needs it on sales from $100. Your client may need it for input tax credits.",
        },
        {
            name: "Province of the sale",
            why: "It decides the rate, so note where the work was done or the goods went.",
        },
        {
            name: "Payment terms",
            why: "The CRA's chart lists these from $500. Printing them on every bill saves working out which bill needs them.",
        },
    ],
    example: {
        currency: "CAD",
        from: {
            name: "Lumen Studio Inc.",
            email: "hello@example.com",
            address: "12 Mill Street, Toronto ON M5V 0A1",
            taxId: "000000000 RT 0001",
            taxIdLabel: "GST/HST no.",
        },
        client: {
            name: "Harbour Cafe Inc.",
            email: "accounts@example.com",
            address: "4 Quay Street, Ottawa ON K1P 0A1",
        },
        taxes: [{ name: "HST (Ontario)", rate: "13" }],
    },
};
