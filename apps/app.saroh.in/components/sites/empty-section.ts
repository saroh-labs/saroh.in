import type { Section, SectionType } from "@/lib/sites/service";

/**
 * A new section carries its key from the moment it exists (#277).
 *
 * The server used to mint it (`claimKey`) and the editor never merged the
 * returned keys back into local state, so every autosave gave a just-added
 * section a NEW key until the page was reloaded. A note pinned in between was
 * attached to a key that no longer existed a few seconds later, and read as
 * orphaned for ever after. `claimKey` keeps a key the client supplies, so
 * minting it here is enough to make it stable.
 */
function newKey(): string {
    return crypto.randomUUID();
}

export function emptySection(type: SectionType): Section {
    switch (type) {
        case "hero":
            return {
                key: newKey(),
                type,
                contractVersion: 1,
                content: { heading: "", subheading: "" },
            };
        case "richText":
            return {
                key: newKey(),
                type,
                contractVersion: 1,
                content: { format: "html", value: "" },
            };
        case "cta":
            return {
                key: newKey(),
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
                key: newKey(),
                type,
                contractVersion: 1,
                content: { images: [], layout: "grid" },
            };
        case "enquiry":
            return {
                key: newKey(),
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
                key: newKey(),
                type,
                contractVersion: 1,
                content: {
                    heading: "",
                    items: [{ title: "", body: "" }],
                },
            };
        case "booking":
            return {
                key: newKey(),
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
