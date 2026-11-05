import type { CountryData } from "../types";

const INVOICING = {
    name: "Invoicing customers, IRAS",
    url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/invoicing-price-display-and-record-keeping/invoicing-customers",
};
const RESPONSIBILITIES = {
    name: "Responsibilities of a GST-registered business, IRAS",
    url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/responsibilities-of-a-gst-registered-business",
};
const CHECKED = "2026-11-02";

export const singapore: CountryData = {
    reviewed: false,
    lede: "Invoices and quotes in Singapore dollars, with the words Tax Invoice and a 9% GST line for registered businesses. Check the source links on this page before you rely on them.",
    paper: "a4",
    dateLocale: "en-GB",
    facts: [
        {
            label: "Tax number",
            value: "Your GST registration number must be shown on all tax invoices, simplified tax invoices and receipts.",
            source: RESPONSIBILITIES,
            checkedOn: CHECKED,
        },
        {
            label: "GST rate",
            value: "9%, from 1 January 2024.",
            source: {
                name: "Prevailing GST rate, IRAS",
                url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/charging-gst-(output-tax)/when-to-charge-goods-and-services-tax-(gst)/prevailing-rate-of-9",
            },
            checkedOn: CHECKED,
        },
        {
            label: "Tax invoice",
            value: "Marked Tax Invoice. Your name, address and GST number, the date, an invoice number, your customer's name and address, a description, the GST rate, and the amounts before GST, of GST and with GST.",
            source: INVOICING,
            checkedOn: CHECKED,
        },
        {
            label: "Time limit",
            value: "Issue a tax invoice within 30 days from the time of supply.",
            source: INVOICING,
            checkedOn: CHECKED,
        },
        {
            label: "Simplified tax invoice",
            value: "Only when the total with GST doesn't exceed $1,000.",
            source: INVOICING,
            checkedOn: CHECKED,
        },
        {
            label: "Quoting prices",
            value: "A registered business must display and quote prices with GST to the public. $109 w/GST is accepted; $100 + GST isn't. Hotels and F&B that charge a service charge are an exception.",
            source: {
                name: "Displaying and quoting prices, IRAS",
                url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/invoicing-price-display-and-record-keeping/displaying-and-quoting-prices",
            },
            checkedOn: CHECKED,
        },
        {
            label: "Keeping invoices",
            value: "At least 5 years, for tax invoices you issue and receive.",
            source: INVOICING,
            checkedOn: CHECKED,
        },
        {
            label: "E-invoicing",
            value: "Phased in. New voluntary registrants from 1 April 2026. New compulsory registrants and existing registered businesses from 1 April 2028 to 1 April 2031, by their annual supplies. Check your date with IRAS.",
            source: {
                name: "GST InvoiceNow Requirement, IRAS",
                url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-invoicenow-requirement",
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
        text: "Agree your terms before the work starts, then repeat them on the bill. The tax invoice has its own clock, which runs from the time of supply, and doesn't move because a client has longer to pay.",
        points: [
            "Print the due date beside the terms",
            "Give your PayNow details or bank account",
            "Put any late charge in your contract first",
        ],
    },
    fields: [
        {
            name: "GST registration number",
            why: "Show it once you're registered. A client who is also registered needs a proper tax invoice from you.",
        },
        {
            name: "Amounts before and with GST",
            why: "A tax invoice shows both, plus the GST between them, so a client can check your sums.",
        },
        {
            name: "Your customer's name and address",
            why: "A tax invoice needs these. A simplified one doesn't list them.",
        },
    ],
    example: {
        currency: "SGD",
        from: {
            name: "Lumen Studio Pte Ltd",
            email: "hello@example.com",
            address: "12 Mill Road, Singapore 048000",
            taxId: "00-0000000-0",
            taxIdLabel: "GST Reg. No.",
        },
        client: {
            name: "Harbour Cafe Pte Ltd",
            email: "accounts@example.com",
            address: "4 Quay Street, Singapore 049000",
        },
        taxes: [{ name: "GST", rate: "9" }],
    },
};
