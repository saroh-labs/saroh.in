import type { CountryData } from "../types";

const DECREE = {
    name: "Federal Decree-Law No. 8 of 2017 on VAT (unofficial translation), FTA",
    url: "https://tax.gov.ae/DataFolder/Files/Pdf/VAT-Decree-Law-No-8-of-2017.pdf",
};
const REGULATION = {
    name: "Cabinet Decision No. 52 of 2017, Executive Regulation (unofficial translation), FTA",
    url: "https://tax.gov.ae/Datafolder/Files/Legislation/Executive%20Regulation%20of%20Federal%20Decree%20Law%20No%208%20of%202017%20-%20Publish%2017112022.pdf",
};
const CHECKED = "2026-11-02";

export const uae: CountryData = {
    reviewed: false,
    lede: "Invoices and quotes in dirhams, with the words Tax Invoice, a TRN and a 5% VAT line where they belong. Check the source links on this page before you rely on them.",
    paper: "a4",
    dateLocale: "en-GB",
    facts: [
        {
            label: "Tax number",
            value: "The Tax Registration Number (TRN), a unique number the Authority issues to each person registered for tax.",
            source: DECREE,
            checkedOn: CHECKED,
        },
        {
            label: "Standard VAT rate",
            value: "5% (Article 3).",
            source: DECREE,
            checkedOn: CHECKED,
        },
        {
            label: "Registering",
            value: "The mandatory threshold is AED 375,000 and the voluntary one AED 187,500 (Articles 7 and 8).",
            source: REGULATION,
            checkedOn: CHECKED,
        },
        {
            label: "Full tax invoice",
            value: "The words Tax Invoice, both parties' names and addresses, your TRN and your customer's if registered, a sequential number, the issue and supply dates, and for each item the unit price, quantity, tax rate and amount in AED, then any discount, the gross amount and the tax (Article 59).",
            source: REGULATION,
            checkedOn: CHECKED,
        },
        {
            label: "Simplified tax invoice",
            value: "Allowed when the customer isn't a registrant, or is one and the supply is AED 10,000 or less. It shows the words Tax Invoice, your details and TRN, the date, a description, the total and the tax.",
            source: REGULATION,
            checkedOn: CHECKED,
        },
        {
            label: "Time limit",
            value: "Issue a tax invoice within 14 days of the date of supply (Article 67).",
            source: DECREE,
            checkedOn: CHECKED,
        },
        {
            label: "Other currencies",
            value: "Convert to dirhams at the Central Bank's approved rate on the date of supply (Article 69).",
            source: DECREE,
            checkedOn: CHECKED,
        },
        {
            label: "Electronic invoicing",
            value: "Businesses with annual revenue of AED 50 million or more implement the system from 1 January 2027, and those below it from 1 July 2027. Check how it applies to you.",
            source: {
                name: "Timelines for the Electronic Invoicing System, Ministry of Finance",
                url: "https://mof.gov.ae/en/news/ministry-of-finance-announces-the-issuance-of-two-ministerial-decisions-on-the-scope-of-obligations-and-the-timelines-for-implementing-the-electronic-invoicing-system-2/",
            },
            checkedOn: "2026-11-04",
        },
        {
            label: "Late payment",
            value: "Set by your contract. Check with a legal adviser before you charge it.",
            general: true,
        },
    ],
    payment: {
        text: "Agree your terms in writing, then repeat them on the invoice. The tax invoice's own clock is separate from your payment terms: it runs from the date of supply, whatever date the client has to pay by.",
        points: [
            "Print the due date beside the terms",
            "Give your IBAN and bank name",
            "Put any late charge in your contract first",
        ],
    },
    fields: [
        {
            name: "TRN",
            why: "Yours goes on every tax invoice, and your customer's too when they're a registrant.",
        },
        {
            name: "Date of supply",
            why: "Show it when it isn't the same as the date you issued the invoice.",
        },
        {
            name: "Amounts in AED",
            why: "Billing in another currency? The tax invoice still shows the dirham figures and the rate you applied.",
        },
    ],
    example: {
        currency: "AED",
        from: {
            name: "Lumen Studio LLC",
            email: "hello@example.com",
            address: "Office 12, Mill Tower, Dubai",
            taxId: "000000000000000",
            taxIdLabel: "TRN",
        },
        client: {
            name: "Harbour Cafe LLC",
            email: "accounts@example.com",
            address: "Shop 4, Quay Walk, Abu Dhabi",
        },
        taxes: [{ name: "VAT", rate: "5" }],
    },
};
