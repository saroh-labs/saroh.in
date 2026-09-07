import type { Section, SectionType } from "@/lib/sites/service";

export function emptySection(type: SectionType): Section {
    switch (type) {
        case "hero":
            return {
                type,
                contractVersion: 1,
                content: { heading: "", subheading: "" },
            };
        case "richText":
            return {
                type,
                contractVersion: 1,
                content: { format: "html", value: "" },
            };
        case "cta":
            return {
                type,
                contractVersion: 2,
                content: {
                    label: "",
                    action: { kind: "url", href: "" },
                    style: "primary",
                },
            };
        case "gallery":
            return {
                type,
                contractVersion: 1,
                content: { images: [], layout: "grid" },
            };
        case "enquiry":
            return {
                type,
                contractVersion: 1,
                content: {
                    title: "Get in touch",
                    submitLabel: "Send",
                    successMessage: "Thanks — we'll be in touch soon.",
                    // Seed with an email field: the contract + the backing Form
                    // both require one, so the section is valid out of the box.
                    fields: [
                        {
                            name: "email",
                            label: "Email",
                            type: "email",
                            required: true,
                        },
                    ],
                },
            };
        case "features":
            /*
             * One empty point, not zero: the contract requires at least one
             * (#255), and a merchant who adds the block should see the shape
             * they are filling in rather than an empty box with an Add button.
             */
            return {
                type,
                contractVersion: 1,
                content: {
                    heading: "",
                    items: [{ title: "", body: "" }],
                },
            };
        case "booking":
            return {
                type,
                contractVersion: 1,
                content: {
                    title: "Book a time",
                    submitLabel: "Confirm booking",
                    successMessage:
                        "You're booked — we've sent a confirmation to your email.",
                },
            };
    }
}
