import type {
    ContactField,
    ContactKindId,
    ContactTopicId,
} from "@/lib/contact-message";

/** /contact: saroh.in's form, with no address to write to: a send that fails says only to try again. */
export const CONTACT = {
    eyebrow: "Contact",
    title: "Talk to a person, not a bot.",
    lead: "A question before you sign up, something not working, or an idea for what we should build next: write to us. A person reads every message and replies by email.",
    form: {
        title: "Send us a message",
        note: "All fields are needed, unless marked optional.",
        topicLabel: "What's it about?",
        topics: [
            {
                id: "question",
                label: "A question before signing up",
                hint: "e.g. Can I take bookings for two branches?",
            },
            {
                id: "help",
                label: "Help with my account",
                hint: "Tell us your business name and what you were trying to do.",
            },
            {
                id: "bug",
                label: "Something's not working",
                hint: "What did you click, and what did you see?",
            },
            {
                id: "other",
                label: "Partnerships or press",
                hint: "Tell us who you are and what you have in mind.",
            },
        ] satisfies { id: ContactTopicId; label: string; hint: string }[],
        nameLabel: "Your name",
        emailLabel: "Email",
        kindLabel: "Your business",
        optional: "(optional)",
        kindNone: "Choose one",
        kinds: [
            { id: "salon", label: "Salon or beauty" },
            { id: "gym", label: "Gym or studio" },
            { id: "clinic", label: "Clinic or dentist" },
            { id: "coach", label: "Dietician or coach" },
            { id: "food", label: "Bakery or food" },
            { id: "shop", label: "Shop" },
            { id: "creator", label: "Creator selling online" },
            { id: "other", label: "Something else" },
        ] satisfies { id: ContactKindId; label: string }[],
        messageLabel: "Message",
        errors: {
            name: "Add your name.",
            email: "Check your email address. We need it to reply.",
            message: "Write a short message, even one line.",
        } satisfies Record<ContactField, string>,
        submit: "Send message",
        sending: "Sending…",
        failed: "We couldn't send your message just now. Nothing was sent. Try again in a minute.",
        rateLimited: "Too many messages from here. Try again later.",
    },
    done: {
        title: (firstName: string) => `Thanks, ${firstName}. We've got it.`,
        replyTo: "We'll reply to",
        again: "Send another message",
    },
    side: [
        {
            title: "Need help with your account?",
            body: "Step-by-step guides for setting up and using Saroh. Often faster than waiting for a reply.",
            href: "/help",
        },
        {
            title: "Something not working?",
            body: "Check the changelog first, since we may have just fixed it. If not, tell us what you clicked and what you saw.",
            href: "/changelog",
        },
        {
            title: "Bought from a business on Saroh?",
            body: "Who is responsible for your order or booking, and how to report a business.",
            href: "/customers",
        },
    ],
} as const;
