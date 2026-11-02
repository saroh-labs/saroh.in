import type { CountryData } from "../types";

/*
 * The ATO refused to serve its pages to our reader on 2 Nov 2026 (HTTP 403), so
 * nothing here is sourced yet. These values were read on business.gov.au that
 * day, not on the ATO's site: check each on ato.gov.au, then add its source.
 */
export const australia: CountryData = {
    reviewed: false,
    lede: "Invoices and quotes in Australian dollars, with your ABN and a GST line ready. Facts on this page still need checking against the ATO, so each one is marked until they are.",
    paper: "a4",
    dateLocale: "en-GB",
    facts: [
        {
            label: "Tax number",
            value: "Your Australian Business Number (ABN).",
            confirm: true,
        },
        {
            label: "GST rate",
            value: "10% on most goods, services and other items. You collect one-eleventh of the sale price.",
            confirm: true,
        },
        {
            label: "Registering for GST",
            value: "You must register when your GST turnover is $75,000 or more, or $150,000 or more for a non-profit. Below that it's optional.",
            confirm: true,
        },
        {
            label: "Heading",
            value: "The words tax invoice if you're registered for GST. If you aren't, use the word invoice instead.",
            confirm: true,
        },
        {
            label: "What a tax invoice shows",
            value: "Your business name and ABN, the issue date, a short description with quantity and price, and the GST payable, or a statement that the total includes GST.",
            confirm: true,
        },
        {
            label: "Larger sales",
            value: "Also the buyer's identity or ABN, at $1,000 or more. Please check the wording, as one government page reads over $1,000.",
            confirm: true,
        },
        {
            label: "When one is required",
            value: "For taxable sales above $82.50 including GST, or when a customer asks. You then have 28 days.",
            confirm: true,
        },
        {
            label: "Receipts",
            value: "Must be given at the time of sale above $75 excluding GST. Below that, within 7 days if the customer asks.",
            confirm: true,
        },
        {
            label: "Credit notes and GST",
            value: "What a credit note must show for GST hasn't been checked. Read the ATO's page before you rely on this template for it.",
            confirm: true,
        },
        {
            label: "Late payment",
            value: "We found no general legal rate of interest. Government advice is a reminder, then a letter of demand or a debt collector.",
            confirm: true,
        },
        {
            label: "Paper size",
            value: "A4. No government page we read sets a paper size.",
            confirm: true,
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
            why: "A larger sale needs it. Printing it on every invoice means you never have to check.",
        },
        {
            name: "GST for each item, or a total statement",
            why: "Show the GST on each line, or say the total price includes GST.",
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
