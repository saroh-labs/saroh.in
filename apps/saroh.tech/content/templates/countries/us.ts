import type { CountryData } from "../types";

const PUB_334 = {
    name: "Publication 334, Tax Guide for Small Business, IRS",
    url: "https://www.irs.gov/publications/p334",
};
const RECORDS = {
    name: "What kind of records should I keep, IRS",
    url: "https://www.irs.gov/businesses/small-businesses-self-employed/what-kind-of-records-should-i-keep",
};
const CHECKED = "2026-11-02";

export const us: CountryData = {
    reviewed: false,
    lede: "Invoices and quotes in US dollars, on Letter paper, with a sales tax line you set by state. Check the source links on this page before you rely on them.",
    paper: "letter",
    dateLocale: "en-US",
    facts: [
        {
            label: "Tax number",
            value: "A sole proprietor generally uses a Social Security number as the taxpayer ID. You must also have an EIN if you pay wages to employees or file pension or excise tax returns.",
            source: PUB_334,
            checkedOn: CHECKED,
        },
        {
            label: "EIN",
            value: "A federal tax ID number for businesses, tax-exempt organizations and other entities, including partnerships, LLCs and corporations.",
            source: {
                name: "Employer ID numbers, IRS",
                url: "https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers",
            },
            checkedOn: CHECKED,
        },
        {
            label: "Giving a client your tax ID",
            value: "Form W-9 gives your correct taxpayer ID to a person who must file an information return with the IRS.",
            source: {
                name: "About Form W-9, IRS",
                url: "https://www.irs.gov/forms-pubs/about-form-w-9",
            },
            checkedOn: CHECKED,
        },
        {
            label: "Sales tax in Texas",
            value: "6.25% state rate. Local taxes can add up to 2%, for a highest combined rate of 8.25%.",
            source: {
                name: "Sales and use tax, Texas Comptroller",
                url: "https://comptroller.texas.gov/taxes/sales/",
            },
            checkedOn: CHECKED,
        },
        {
            label: "Sales tax in California",
            value: "7.25% statewide. District taxes run from 0.10% to 2.00%, and an area can have more than one.",
            source: {
                name: "Sales and use tax rates, CDTFA",
                url: "https://www.cdtfa.ca.gov/taxes-and-fees/sales-use-tax-rates.htm",
            },
            checkedOn: CHECKED,
        },
        {
            label: "Showing the tax in Texas",
            value: "You must state the sales tax separately on the bill, unless you tell the customer in writing and post a sign that tax is included.",
            source: {
                name: "Sales tax collection FAQ, Texas Comptroller",
                url: "https://comptroller.texas.gov/taxes/sales/faq/collection.php",
            },
            checkedOn: CHECKED,
        },
        {
            label: "Copies to keep",
            value: "Keep documents that show the amounts and sources of your gross receipts. The IRS lists invoices and receipt books among them.",
            source: RECORDS,
            checkedOn: CHECKED,
        },
        {
            label: "How long to keep them",
            value: "The general period is 3 years, with longer periods in some cases.",
            source: {
                name: "How long should I keep records, IRS",
                url: "https://www.irs.gov/businesses/small-businesses-self-employed/how-long-should-i-keep-records",
            },
            checkedOn: CHECKED,
        },
        {
            label: "Heading and required fields",
            value: "The word Invoice, with no federal list of fields. None of the IRS pages we read sets a heading or a list.",
            confirm: true,
        },
        {
            label: "Late payment",
            value: "Set by your contract and state law. None of the federal or state tax pages we read gives a rule.",
            confirm: true,
        },
        {
            label: "Paper size",
            value: "US Letter. No tax agency page we read sets a paper size.",
            confirm: true,
        },
    ],
    payment: {
        text: "Say what you expect in writing before the work starts, then repeat it on the invoice. A client in another state may read your dates and terms differently, so spell them out.",
        points: [
            "Print the due date, not only Net 30",
            "List the ways to pay: card link, ACH or check",
            "Put any late fee in your contract first",
        ],
    },
    fields: [
        {
            name: "Sales tax line",
            why: "Name the state and the rate. Leave the line out when the sale isn't taxable where you sell it.",
        },
        {
            name: "Your EIN, if you have one",
            why: "A client's accounts team may ask for it. Don't print a Social Security number on a bill.",
        },
        {
            name: "Your legal business name",
            why: "Use the name your client will see on your W-9, so their records match yours.",
        },
    ],
    example: {
        currency: "USD",
        from: {
            name: "Lumen Studio LLC",
            email: "hello@example.com",
            address: "12 Mill Street, Austin, TX 78701",
            taxId: "00-0000000",
            taxIdLabel: "EIN",
        },
        client: {
            name: "Harbour Cafe Inc.",
            email: "accounts@example.com",
            address: "4 Quay Street, Dallas, TX 75201",
        },
        taxes: [{ name: "Texas state sales tax", rate: "6.25" }],
    },
};
