import type { CountryData } from "../types";

const VAT_NOTICE = {
    name: "VAT Notice 700, GOV.UK",
    url: "https://www.gov.uk/guidance/vat-guide-notice-700",
};
const INVOICES = {
    name: "Invoices: what they must include, GOV.UK",
    url: "https://www.gov.uk/invoicing-and-taking-payment-from-customers/invoices-what-they-must-include",
};
const CHECKED = "2026-11-02";

export const uk: CountryData = {
    reviewed: false,
    lede: "Invoices and quotes in pounds, with the VAT line set up and the fields GOV.UK lists. Check the source links on this page before you rely on them.",
    paper: "a4",
    dateLocale: "en-GB",
    facts: [
        {
            label: "Every invoice",
            value: "A unique number, your business name, address and contact details, your customer's name and address, a description, the supply date, the invoice date, the amounts and the total owed.",
            source: INVOICES,
            checkedOn: CHECKED,
        },
        {
            label: "When a VAT invoice is needed",
            value: "You must use VAT invoices if you and your customer are both VAT registered.",
            source: INVOICES,
            checkedOn: CHECKED,
        },
        {
            label: "What a full VAT invoice adds",
            value: "Your VAT registration number, the time of supply (tax point), and for each item the quantity, unit price, VAT rate and the amount excluding VAT, then the total VAT in sterling.",
            source: VAT_NOTICE,
            checkedOn: CHECKED,
        },
        {
            label: "Less detailed VAT invoices",
            value: "Allowed for a supply of £250 or less if your customer agrees (paragraph 16.6.1).",
            source: VAT_NOTICE,
            checkedOn: CHECKED,
        },
        {
            label: "Time limit",
            value: "You should normally issue a VAT invoice within 30 days of the tax point (paragraph 16.2.3).",
            source: VAT_NOTICE,
            checkedOn: CHECKED,
        },
        {
            label: "Standard VAT rate",
            value: "20%.",
            source: {
                name: "VAT rates, GOV.UK",
                url: "https://www.gov.uk/vat-rates",
            },
            checkedOn: CHECKED,
        },
        {
            label: "Late payment interest",
            value: "Statutory interest on business-to-business debt is 8% plus the Bank of England base rate, unless a contract sets a different rate.",
            source: {
                name: "Charging interest on commercial debt, GOV.UK",
                url: "https://www.gov.uk/late-commercial-payments-interest-debt-recovery/charging-interest-commercial-debt",
            },
            checkedOn: CHECKED,
        },
    ],
    payment: {
        text: "Business clients in the UK often pay on 14 or 30 day terms. If a business pays late you may be able to charge statutory interest, and it helps to say your terms on the invoice from the start.",
        points: [
            "State the due date, not just the terms",
            "Give your sort code and account number",
            "Say if you'll claim interest on late payment",
        ],
    },
    fields: [
        {
            name: "VAT registration number",
            why: "It goes on every VAT invoice. If you aren't registered, leave out both the number and the VAT line.",
        },
        {
            name: "Tax point",
            why: "This is the time of supply. Show it when it differs from the invoice date.",
        },
        {
            name: "Your legal name",
            why: "A limited company uses its full name as on its certificate of incorporation.",
        },
    ],
    example: {
        currency: "GBP",
        from: {
            name: "Lumen Studio Ltd",
            email: "hello@example.com",
            address: "12 Mill Lane, Bristol BS1 0AA",
            taxId: "GB000 0000 00",
            taxIdLabel: "VAT no.",
        },
        client: {
            name: "Harbour Cafe Ltd",
            email: "accounts@example.com",
            address: "4 Quay Street, Leeds LS1 0AA",
        },
        taxes: [{ name: "VAT", rate: "20" }],
    },
};
