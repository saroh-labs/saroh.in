import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `clinic` — the Clinic industry template (industry templates plan, U11),
 * designed in code from the gallery's line for it: "Treatments with their
 * visits and prices, the doctors, and the next free appointment, in calm
 * clinic blues". Services shape. Design note:
 * `saroh-designs/templates/Clinic.spec.md`; the seeded Kavi Dental site
 * (`clinic-site.ts`) was the starting point for what a clinic shows.
 *
 * The visitor has something wrong, or is due a check-up, and wants two
 * answers: "can I get an appointment, and what does a treatment involve".
 * So the page opens on the next free appointment (the hero's On today
 * panel, read live, each time a link into the booking page) above a photo
 * of the room they will sit in, then the treatments as cards — what each
 * costs and how long a visit takes, a treatment of several visits priced
 * for all of them — then what happens, step by step, with a plain medical
 * disclaimer under it; the doctors; the questions people ask before coming;
 * and the hours with the address on the dark band. Its sections lead the
 * header menu (Treatments · How it works · Doctors · Questions · Hours).
 *
 * The look (DEC-090): Inter Tight headings set close over Inter, cool paper,
 * a deep blue-green ink and one calm teal, small square-ish corners, small
 * uppercase labels like a clinic's signage. Nothing urgent, no
 * before-and-after, no claim to treat or cure.
 *
 * What is the business's own, never typed here (ADR-004, KTD-4):
 * - the next free times, only with Appointments on (`hero` `onToday`);
 * - the treatments, their prices and visit lengths (`servicesList`), laid
 *   down only with Appointments on and a service to name; how many visits a
 *   treatment takes is the service's own (E10) and the booking page says
 *   it;
 * - the week's hours and the address (`hours`), drawn only once saved;
 * - the email (the business profile's).
 *
 * What is the owner's to replace: the doctors (placeholders, each with a
 * photo brief, never an invented person or qualification) and the footer's
 * line. The steps and the questions are written as guidance to the patient,
 * true of any clinic, so none of them is a claim the clinic did not make;
 * the disclaimer is honest and the owner can edit it.
 */

export const CLINIC_TEMPLATE_ID = "clinic";

/** The module key that makes Services bookable (`module-registry.ts`). */
const APPOINTMENTS = "APPOINTMENTS";

/** A services list holds at most this many (its contract). */
const SERVICES_LIST_MAX = 24;

function stringList(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string" && v !== "")
        : [];
}

function appointmentsOn(ctx: TemplateContext): boolean {
    return stringList((ctx as { modules?: unknown }).modules).includes(
        APPOINTMENTS,
    );
}

/**
 * The treatments the page lists, or none: only with Appointments on, and
 * only ids the context gives.
 */
export function clinicServiceIds(ctx: TemplateContext): string[] {
    if (!appointmentsOn(ctx)) return [];
    const { serviceIds } = ctx as { serviceIds?: unknown };
    return [...new Set(stringList(serviceIds))].slice(0, SERVICES_LIST_MAX);
}

function hasTreatments(ctx: TemplateContext): boolean {
    return clinicServiceIds(ctx).length > 0;
}

const NUMBER_WORDS = [
    "No",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
] as const;

function countWord(n: number): string {
    return NUMBER_WORDS[n] ?? String(n);
}

/**
 * The headline. The gallery's idea was "Book a check-up. We'll remind
 * you.", but nothing sends a reminder yet, so the second half says what the
 * page does instead.
 */
const HEADLINE = "Book a check-up. Know what happens next.";

function heroLine(ctx: TemplateContext): string {
    if (ctx.tagline) return ctx.tagline;
    if (hasTreatments(ctx)) {
        return "Every treatment with its price and how many visits it takes, who you will see, and the next free appointment.";
    }
    return `The treatments at ${ctx.organizationName}, who you will see, and how to get an appointment.`;
}

/**
 * What happens, as guidance to the patient: true of any clinic, so the
 * template claims nothing about this one's practice.
 */
const STEPS = [
    {
        title: "A first appointment",
        body: "The doctor asks what has been bothering you, examines, and explains what they find in plain words. Ask anything; there are no silly questions.",
    },
    {
        title: "A plan and a price",
        body: "If something needs treatment, ask for the plan, how many visits it takes and the price before it starts.",
    },
    {
        title: "The visits",
        body: "Book each visit at a time that suits you, and bring any reports, scans or prescriptions you already have.",
    },
    {
        title: "Afterwards",
        body: "If a review visit is useful the doctor will say so. Call the clinic if anything feels wrong before then.",
    },
] as const;

/** Under the steps: plain, and the owner's to edit. */
const DISCLAIMER =
    "Nothing on this site is a diagnosis or a substitute for seeing a doctor. In an emergency, go to the nearest hospital.";

/**
 * The doctors: placeholders the owner writes over, never invented people
 * or qualifications. Two, the size of most practices; the bios say to add
 * or remove.
 */
const DOCTORS = [
    {
        name: "Your first doctor",
        role: "Their qualification and what they practise",
        bio: "A placeholder. Say what they treat, where they trained and the days they see patients.",
        imageBrief:
            "The doctor at the chairside or desk, explaining something, looking at the patient not the camera",
    },
    {
        name: "Your second doctor",
        role: "Their qualification and what they practise",
        bio: "A placeholder. Add one of these for each doctor, or remove this one if you practise alone.",
        imageBrief:
            "The doctor in the corridor or at reception, plain wall, natural light",
    },
] as const;

function doctors(frame: Record<string, unknown> = {}) {
    const [first, ...rest] = DOCTORS;
    return {
        variant: "team",
        ...frame,
        ...first,
        people: rest.map((p) => ({ ...p })),
    };
}

/**
 * The questions people ask before coming in, answered with what is true of
 * any clinic and of the booking page. The one about visits only where the
 * treatments are listed above it.
 */
function questions(ctx: TemplateContext) {
    return [
        {
            question: "What should I bring?",
            answer: "Any reports, scans, X-rays or prescriptions you already have, and the names of the medicines you take. Old ones are worth bringing too.",
        },
        ...(hasTreatments(ctx)
            ? [
                  {
                      question: "How many visits will a treatment take?",
                      answer: "Each treatment above says how long a visit takes. One that needs several visits is priced for all of them: the booking page says how many, you book the first there, and the clinic books the rest with you.",
                  },
              ]
            : []),
        {
            question: "What if it can't wait?",
            answer: "Call the clinic first. If you cannot reach anyone and it is an emergency, go to the nearest hospital.",
        },
    ];
}

/** Without email or a booking page, the way to ask for an appointment. */
const ENQUIRY_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    {
        name: "message",
        label: "What would you like to be seen for, and which days suit you?",
        type: "textarea",
        required: true,
    },
] as const;

/**
 * Both colourways: small, nearly square corners, even sections, a 52px
 * Inter Tight headline, 16px Inter at a 68ch measure in a 1120px frame,
 * small uppercase labels.
 */
const SCALARS = {
    pageMargin: 40,
    sectionPadding: 60,
    gridGap: 12,
    cornerRadius: 6,
    headingScale: 0.95,
} as const;
const TYPE = {
    displaySize: 52,
    bodySize: 16,
    measure: 68,
    contentWidth: 1120,
    labelStyle: "eyebrow",
} as const;

export const clinicTemplate: TemplateManifest = {
    id: CLINIC_TEMPLATE_ID,
    version: 1,
    name: "Clinic",
    description:
        "For a clinic or practice: the next free appointment, every treatment with its price and visits, what a treatment involves, the doctors, questions before coming in, and the hours.",
    slug: "clinic",
    kinds: ["clinic"],
    shape: "services",
    sample: { name: "Kavi Dental", host: "kavidental.saroh.app" },
    uses: [APPOINTMENTS],
    styles: [
        {
            id: "tide",
            name: "Tide",
            style: {
                colours: {
                    pageGround: "mist",
                    text: "navy",
                    accent: "teal",
                    heroBackground: "paper",
                    ctaBand: "navy",
                    footer: "navy",
                },
                scalars: SCALARS,
                fontPair: "inter-tight",
                // The gallery's paper, ink and teal, exact.
                palette: {
                    bg: "#F4F7F8",
                    surface: "#E5EEF1",
                    fg: "#16303A",
                    body: "#24414B",
                    muted: "#4C6570",
                    border: "#D8E3E7",
                    accent: "#2F7A8C",
                    accentFg: "#FFFFFF",
                    heroBg: "#F4F7F8",
                    heroFg: "#16303A",
                    ctaBg: "#2F7A8C",
                    ctaFg: "#FFFFFF",
                    footerBg: "#E5EEF1",
                    footerFg: "#16303A",
                },
                type: TYPE,
            },
        },
        {
            id: "heather",
            name: "Heather",
            style: {
                colours: {
                    pageGround: "mist",
                    text: "plum",
                    accent: "steel",
                    heroBackground: "paper",
                    ctaBand: "plum",
                    footer: "plum",
                },
                scalars: SCALARS,
                fontPair: "inter-tight",
                // The same page recoloured in OKLCH, lightness and chroma
                // held, hue turned to a quiet heather.
                palette: {
                    bg: "#F7F6F8",
                    surface: "#EDEBF2",
                    fg: "#2F283C",
                    body: "#3F384E",
                    muted: "#635D72",
                    border: "#E2DFE8",
                    accent: "#766496",
                    accentFg: "#FFFFFF",
                    heroBg: "#F7F6F8",
                    heroFg: "#2F283C",
                    ctaBg: "#766496",
                    ctaFg: "#FFFFFF",
                    footerBg: "#EDEBF2",
                    footerFg: "#2F283C",
                },
                type: TYPE,
            },
        },
    ],
    /*
     * The foot: the name, the address, the clinic's registration. The
     * owner's words, in Site settings.
     */
    footer: {
        line: "Your clinic's address · your registration number",
        layout: "left",
    },
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    // The headline beside the next free appointments (with
                    // Appointments on), the room below; the page's h1.
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "split",
                        heading: HEADLINE,
                        subheading: heroLine(ctx),
                        imageBrief:
                            "The treatment room in daylight: the chair empty, surfaces clear, nothing clinical on show",
                        ...(appointmentsOn(ctx) ? { onToday: true } : {}),
                        ...(hasTreatments(ctx)
                            ? {
                                  cta: {
                                      label: "Book an appointment",
                                      href: "/book",
                                      style: "primary",
                                  },
                              }
                            : {}),
                    }),
                },
                {
                    // The treatments as cards, read live: name, what it is,
                    // a visit's length and the price.
                    type: "servicesList",
                    contractVersion: 1,
                    when: hasTreatments,
                    content: (ctx: TemplateContext) => ({
                        anchor: "treatments",
                        navLabel: "Treatments",
                        band: "surface",
                        heading: "Treatments",
                        intro: "What each one is, how long a visit takes and what it costs. A treatment that needs several visits is priced for all of them.",
                        serviceIds: clinicServiceIds(ctx),
                        showPrices: true,
                        showDescriptions: true,
                        layout: "cards",
                        buttonLabel: "Book",
                    }),
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: {
                        anchor: "how",
                        navLabel: "How it works",
                        variant: "steps",
                        columns: 2,
                        heading: "What a treatment involves",
                        intro: `${countWord(STEPS.length)} steps, and you can stop and ask at any of them.`,
                        items: STEPS.map((s) => ({ ...s })),
                        note: DISCLAIMER,
                    },
                },
                {
                    type: "person",
                    contractVersion: 1,
                    content: doctors({
                        anchor: "doctors",
                        navLabel: "Doctors",
                        title: "Who you will see",
                    }),
                },
                {
                    type: "faq",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        anchor: "questions",
                        navLabel: "Questions",
                        heading: "Before you come in",
                        items: questions(ctx),
                    }),
                },
                {
                    // Write to the clinic, when it has an email…
                    type: "contact",
                    contractVersion: 1,
                    when: (ctx) => Boolean(ctx.contactEmail),
                    content: (ctx: TemplateContext) => ({
                        anchor: "contact",
                        heading: "Ask before you book",
                        intro: "Not sure which treatment you need? Write with what has been bothering you, and the clinic will reply.",
                        email: ctx.contactEmail,
                    }),
                },
                {
                    // …else a form, when there is no booking page either.
                    type: "enquiry",
                    contractVersion: 1,
                    when: (ctx) => !ctx.contactEmail && !hasTreatments(ctx),
                    content: {
                        anchor: "appointments",
                        title: "Ask for an appointment",
                        description:
                            "Say what you would like to be seen for and which days suit you, and the clinic will reply with a time.",
                        submitLabel: "Send",
                        successMessage:
                            "Thank you. The clinic will reply to the email you gave.",
                        fields: ENQUIRY_FIELDS.map((f) => ({ ...f })),
                    },
                },
                {
                    // The week and the address on the dark band. Nothing
                    // until hours are saved.
                    type: "hours",
                    contractVersion: 1,
                    content: {
                        anchor: "hours",
                        navLabel: "Hours",
                        band: "inverse",
                        title: "Appointments and hours",
                        groupDays: true,
                        showAddress: true,
                    },
                },
            ],
        },
    ],
};

/**
 * The sample doctors the gallery renders this template with (KTD-6), in
 * place of the placeholders a live site starts with: Kavi Dental's two
 * dentists from the seeded showcase. Never laid down on a merchant's site.
 */
export const CLINIC_GALLERY_SAMPLE = {
    doctors: [
        {
            name: "Dr. Meenakshi Rao",
            role: "Dentist · BDS",
            bio: "Check-ups, root canals and the patients who are nervous about them. Mornings, Monday to Saturday.",
        },
        {
            name: "Dr. Arun Pillai",
            role: "Dentist · BDS",
            bio: "Check-ups and whitening, and video consultations for a first opinion. Late mornings.",
        },
    ],
} as const;
