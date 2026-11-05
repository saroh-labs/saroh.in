// The boards' own data drawn with the shared blocks: for content-blocks.test.tsx and the design check's screenshots.
import { outlineOf, parseBlocks } from "./blocks/parse";
import {
    AnswerBox,
    Byline,
    FactsStrip,
    NumberedList,
    OnThisPage,
    Related,
    Section,
} from "./components/content-blocks";
import { ContentLayout } from "./components/content-layout";
import type { DataTableProps } from "./components/data-table";
import { DataTable } from "./components/data-table";
import { HubPage } from "./components/hub-page";
import { ClosingBand, Crumbs, Questions } from "./components/page-parts";
import { Prose } from "./components/prose";
import type { Question } from "./schema";

const author = { name: "Asha Rao", role: "editor at Saroh" };

export const SALON_INVOICE: DataTableProps = {
    variant: "invoice",
    caption: "A sample invoice",
    columns: [
        { label: "Service" },
        { label: "SAC", kind: "code" },
        { label: "Value", kind: "value" },
        { label: "CGST 2.5%", kind: "tax" },
        { label: "SGST 2.5%", kind: "tax" },
        { label: "Total", kind: "total" },
    ],
    rows: [
        {
            cells: [
                "Haircut & blow-dry (women)",
                "999721",
                "₹800.00",
                "₹20.00",
                "₹20.00",
                "₹840.00",
            ],
            note: "GST 5%",
        },
        {
            cells: [
                "D-Tan facial",
                "999722",
                "₹1,500.00",
                "₹37.50",
                "₹37.50",
                "₹1,575.00",
            ],
            note: "GST 5%",
        },
    ],
    total: ["Total", "", "₹2,300.00", "₹57.50", "₹57.50", "₹2,415.00"],
};

export const IGST_INVOICE: DataTableProps = {
    variant: "invoice",
    caption: "A sample invoice to another state",
    columns: [
        { label: "Course" },
        { label: "SAC", kind: "code" },
        { label: "Value", kind: "value" },
        { label: "IGST 18%", kind: "tax" },
        { label: "Total", kind: "total" },
    ],
    rows: [
        {
            cells: [
                "Spoken English, live",
                "999293",
                "₹4,999.00",
                "₹899.82",
                "₹5,898.82",
            ],
            note: "GST 18%",
        },
    ],
    total: ["Total", "", "₹4,999.00", "₹899.82", "₹5,898.82"],
};

export const COMPOSITION: DataTableProps = {
    variant: "compare",
    caption: "Composition or regular: what changes",
    columns: [
        { label: "What changes" },
        { label: "Composition" },
        { label: "Regular" },
    ],
    rows: [
        { cells: ["Charge GST to customers", false, true] },
        { cells: ["Bill you give", "Bill of supply", "Tax invoice"] },
        { cells: ["Input tax credit", false, true] },
        { cells: ["Sell goods to other states", false, true] },
    ],
    highlight: 2,
    phoneNote: (
        <>
            Bill you give: <b>Bill of supply</b> on composition,{" "}
            <b>Tax invoice</b> on regular.
        </>
    ),
};

export const BOTH_WAYS: DataTableProps = {
    variant: "compare",
    caption: "The same ₹10,000 at 18%, both ways",
    columns: [
        { label: "Customer" },
        { label: "Value", kind: "value" },
        { label: "CGST 9%", kind: "tax" },
        { label: "SGST 9%", kind: "tax" },
        { label: "IGST 18%", kind: "tax" },
        { label: "Total", kind: "total" },
    ],
    rows: [
        {
            cells: [
                "In your state",
                "₹10,000.00",
                "₹900.00",
                "₹900.00",
                "—",
                "₹11,800.00",
            ],
        },
        {
            cells: [
                "In another state",
                "₹10,000.00",
                "—",
                "—",
                "₹1,800.00",
                "₹11,800.00",
            ],
        },
    ],
};

export const QUESTIONS: Question[] = [
    {
        question: "Do I need to charge GST if I'm not registered?",
        answer: [
            "No, and you mustn't. A business that isn't registered can't collect GST; it gives a plain bill with no tax.",
        ],
    },
    {
        question: "Is GST different for products I sell in the salon?",
        answer: [
            "Yes. Products go at the rate for their HSN code, on their own line.",
        ],
    },
];

const GST_GUIDES = [
    {
        name: "GST on salon and beauty services",
        search: "gst on salon services",
    },
    {
        name: "GST on gym and fitness memberships",
        search: "gst on gym membership",
    },
    { name: "GST on yoga and dance classes", search: "gst on yoga classes" },
    {
        name: "Tax invoice or bill of supply?",
        search: "tax invoice vs bill of supply",
    },
];

/** GST salon board (`gst/SalonServices*`). */
export function GstShowcase() {
    return (
        <ContentLayout
            layout="rail"
            aside={
                <Related
                    variant="rail"
                    title="More GST guides"
                    current={{ search: "gst on salon services" }}
                    tools={[
                        {
                            name: "GST calculator",
                            line: "Add or take out 5% in a second.",
                        },
                        {
                            name: "GST invoice generator",
                            line: "A PDF with this split worked out.",
                        },
                    ]}
                    items={GST_GUIDES}
                />
            }
            band={
                <ClosingBand
                    look="stack"
                    src="gst-salon-band"
                    title="GST invoices that work this out for you"
                    line="Give each service its SAC and rate once. Every booking and payment gets a numbered invoice with the right split."
                    label="Start free"
                />
            }
        >
            <div className="sp-sc">
                <Crumbs
                    crumbs={[
                        { name: "GST guides" },
                        { name: "Salon and beauty services" },
                    ]}
                    home={{}}
                    sep="›"
                    collapse
                />
                <h1
                    style={{
                        margin: 0,
                        fontFamily: "var(--sp-display)",
                        fontSize: 46,
                        lineHeight: 1.06,
                        letterSpacing: "-0.04em",
                    }}
                >
                    GST on salon and beauty services: rate, SAC code and a
                    sample invoice
                </h1>
                <AnswerBox>
                    salon, barber and beauty services are taxed at{" "}
                    <b>5% GST, without input tax credit</b>, since 22 Sep 2025.
                    It was 18% before. Within your state that&apos;s CGST 2.5% +
                    SGST 2.5%.
                </AnswerBox>
            </div>
            <FactsStrip
                facts={[
                    {
                        label: "Rate",
                        value: "5%",
                        note: "without input tax credit",
                    },
                    {
                        label: "SAC: hair",
                        value: "999721",
                        note: "hairdressing and barbers",
                    },
                    {
                        label: "SAC: beauty",
                        value: "999722",
                        note: "cosmetic treatment, manicure, pedicure",
                    },
                    {
                        label: "In your state",
                        value: "CGST 2.5% + SGST 2.5%",
                        note: "another state: IGST 5%",
                    },
                ]}
            />
            <Section
                title="A sample invoice"
                note="Gulmohar Unisex Salon in Koramangala, Bengaluru, and a customer in Bengaluru."
            >
                <DataTable {...SALON_INVOICE} />
            </Section>
            <Section
                title="Composition or regular: what changes"
                note="A composition business pays its flat rate from its own pocket."
            >
                <DataTable {...COMPOSITION} />
            </Section>
            <Section title="The same ₹10,000 at 18%, both ways">
                <DataTable {...BOTH_WAYS} />
            </Section>
            <Section title="Common mistakes" tight>
                <NumberedList
                    items={[
                        {
                            lead: "Still charging 18%.",
                            text: "Check your billing software and printed rate cards.",
                        },
                        {
                            lead: "Claiming input tax credit.",
                            text: "At 5% for these services, the credit isn't available.",
                        },
                        {
                            lead: "One line for a service and a product.",
                            text: "Bill a facial and the serum on separate lines.",
                        },
                    ]}
                />
            </Section>
            <Questions
                questions={QUESTIONS}
                headingClass="sp-h2c"
                compact
                openFirst
            />
            <Byline
                variant="line"
                author={author}
                updated="2026-10-24"
                note="A guide, not tax advice: check with your CA for your own case."
            />
        </ContentLayout>
    );
}

export const GUIDE_BODY = `## 1. Remind them the day before

Plain words, short paragraphs, written for **one owner**.

| When | What to send |
| --- | --- |
| The day before | Your booking is tomorrow at 4 pm. |
| Two hours before | See you at 4. Reply C to cancel. |

> Reminders go out by themselves for every booking. [See how bookings work](/help/bookings).

## 2. Ask for a deposit on long services

- Ask for it when they book.
- Say what happens if they don't come.
`;

/** Guide board (`guides/Sample*`). */
export function GuideShowcase() {
    const blocks = parseBlocks("guide.mdx", GUIDE_BODY);
    return (
        <ContentLayout
            layout="solo"
            band={
                <ClosingBand
                    look="stack"
                    title="Reminders and deposits, set up once."
                    line="Start free and turn them on for the services that need them."
                    label="Start free"
                />
            }
        >
            <div className="sp-sc">
                <Crumbs
                    crumbs={[{ name: "Guides" }, { name: "Cut no-shows" }]}
                    home={{}}
                    sep="›"
                    collapse
                />
                <h1
                    style={{
                        margin: 0,
                        fontFamily: "var(--sp-display)",
                        fontSize: 50,
                        lineHeight: 1.05,
                    }}
                >
                    How to reduce no-shows at your salon or clinic
                </h1>
                <Byline
                    variant="block"
                    author={author}
                    published="2026-10-24"
                    updated="2026-10-24"
                    readMinutes={7}
                />
            </div>
            <OnThisPage items={outlineOf(blocks)} />
            <Prose blocks={blocks} />
            <Questions questions={QUESTIONS} headingClass="sp-h2c" />
            <Related
                variant="cards"
                title="More guides"
                items={[
                    {
                        name: "Salons",
                        line: "Stylists, services and deposits for hair and beauty salons.",
                    },
                    {
                        name: "Spas",
                        line: "Rooms, therapists and packages booked in one place.",
                    },
                    {
                        name: "Nail studios",
                        line: "Short slots, add-ons and repeat clients.",
                    },
                ]}
            />
        </ContentLayout>
    );
}

/** Guides hub board (`guides/Hub*`). */
export function HubShowcase() {
    const card = (name: string, eyebrow: string, line: string) => ({
        name,
        eyebrow,
        line,
    });
    return (
        <HubPage
            crumbs={[{ name: "Guides" }]}
            title="Guides for running a small business in India"
            lead="Plain answers to the jobs that eat your week: fewer no-shows, getting paid on time, and customers who come back."
            chips={{
                label: "Guides for your trade",
                chips: [
                    { label: "All", current: true },
                    { label: "Salons" },
                    { label: "Gyms and studios" },
                    { label: "Clinics" },
                ],
            }}
            groups={[
                {
                    title: "Bookings and no-shows",
                    cards: [
                        card(
                            "How to reduce no-shows at your salon or clinic",
                            "8 min read",
                            "Reminders, deposits and a cancellation rule clients accept.",
                        ),
                        card(
                            "Should you take a deposit for bookings?",
                            "6 min read",
                            "When it helps, how much, and what to say when you ask.",
                        ),
                        card(
                            "Running a waitlist that fills cancelled slots",
                            "5 min read",
                            "Who to offer first, and how long to hold a slot.",
                        ),
                    ],
                },
            ]}
            footnote="Each guide carries a reviewed-on date and links to the free tool or help guide it mentions."
            band={
                <ClosingBand
                    look="wide"
                    title="Less reading, more doing."
                    line="Saroh takes deposits when people book and sends the pay links, so you chase less."
                    label="Start free"
                />
            }
        />
    );
}
