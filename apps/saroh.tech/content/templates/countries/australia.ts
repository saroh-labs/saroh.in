import type { CountryData } from "../types";

/*
 * The ATO refuses our reader (HTTP 403, 2 and 4 Nov 2026), so these are from the
 * Australian Government's business.gov.au, read on 4 Nov 2026. Recheck on
 * ato.gov.au when someone can open it.
 */
const HOW_TO_INVOICE = {
    name: "How to invoice, business.gov.au",
    url: "https://business.gov.au/finance/payments-and-invoicing/how-to-invoice",
};
const REGISTER = {
    name: "Register for GST, business.gov.au",
    url: "https://business.gov.au/registrations/register-for-taxes/register-for-goods-and-services-tax-gst",
};
const CHECKED = "2026-11-04";

export const australia: CountryData = {
    reviewed: false,
    lede: "Invoices and quotes in Australian dollars, with your ABN and a GST line ready. Check the source links on this page before you rely on them.",
    paper: "a4",
    dateLocale: "en-GB",
    facts: [
        {
            label: "Tax number",
            value: "Your Australian Business Number (ABN).",
            source: HOW_TO_INVOICE,
            checkedOn: CHECKED,
        },
        {
            label: "GST rate",
            value: "10% on most goods, services and other items. You collect one-eleventh of the sale price.",
            source: REGISTER,
            checkedOn: CHECKED,
        },
        {
            label: "Registering for GST",
            value: "You must register when your GST turnover is $75,000 or more, or $150,000 or more for a non-profit. Otherwise it's optional.",
            source: REGISTER,
            checkedOn: CHECKED,
        },
        {
            label: "Heading",
            value: "The words tax invoice if you're registered for GST. If you aren't, use the word invoice instead.",
            source: HOW_TO_INVOICE,
            checkedOn: CHECKED,
        },
        {
            label: "What a tax invoice shows",
            value: "The words tax invoice, your business name and ABN, the issue date, a short description with quantity and price, and the amount of GST payable, if any.",
            source: HOW_TO_INVOICE,
            checkedOn: CHECKED,
        },
        {
            label: "Larger sales",
            value: "Also the buyer's identity or ABN, on sales over $1,000.",
            source: HOW_TO_INVOICE,
            checkedOn: CHECKED,
        },
        {
            label: "When one is required",
            value: "For a taxable sale of more than $82.50 including GST. If a customer asks for one, whatever the amount, you have 28 days to give it.",
            source: HOW_TO_INVOICE,
            checkedOn: CHECKED,
        },
        {
            label: "Receipts",
            value: "Must be given at the time of sale for purchases over $75 excluding GST. For smaller ones, within 7 days of a customer asking.",
            source: {
                name: "Receipts and proof of purchase, business.gov.au",
                url: "https://business.gov.au/finance/payments-and-invoicing/receipts-and-proof-of-purchase",
            },
            checkedOn: CHECKED,
        },
        {
            label: "Late payment",
            value: "Set by your contract. Check with a legal adviser before you charge it.",
            general: true,
        },
    ],
    payment: {
        text: "Business.gov.au suggests putting your terms on invoices and contracts, so customers know how to pay, when it's due and how you handle overdue bills. Its examples for business credit are 7, 14, 21 or 31 days.",
        points: [
            "Print the due date beside the terms",
            "Give your BSB and account number",
            "Start overdue bills with a polite reminder",
        ],
    },
    fields: [
        {
            name: "ABN",
            why: "It belongs on a tax invoice and on a receipt, so a customer can see who sold to them.",
        },
        {
            name: "Buyer's name or ABN",
            why: "A sale over $1,000 needs it. Printing it on every invoice means you never have to check.",
        },
        {
            name: "The GST payable",
            why: "A tax invoice shows the amount of GST, if any.",
        },
    ],
    example: {
        currency: "AUD",
        from: {
            name: "Lumen Studio Pty Ltd",
            email: "hello@example.com",
            address: "12 Mill Lane, Melbourne VIC 3000",
            taxId: "00 000 000 000",
            taxIdLabel: "ABN",
        },
        client: {
            name: "Harbour Cafe Pty Ltd",
            email: "accounts@example.com",
            address: "4 Quay Street, Sydney NSW 2000",
        },
        taxes: [{ name: "GST", rate: "10" }],
    },
};
