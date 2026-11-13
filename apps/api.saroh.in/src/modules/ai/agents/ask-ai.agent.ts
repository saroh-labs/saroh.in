import type { AgentDefinition, StatusWords } from "./agent-definition";
import { businessBlock } from "./business-block";
import { HOUSE_RULES } from "./house-rules";

/**
 * Ask AI (DEC-220): answers a business's questions about its own data from
 * Saroh's read tools, as the person asking. The tools are wired in U4 and
 * the draft tools in U5; the order here is the order sent, and changing it
 * changes the agent's version.
 */
export const ASK_AI_TOOLS = [
    "list_bookings",
    "get_booking",
    "find_free_slots",
    "get_hours",
    "list_services",
    "list_products",
    "get_product",
    "list_orders",
    "get_order",
    "list_customers",
    "get_customer",
    "list_enquiries",
    "get_enquiry",
] as const;
export type AskAiTool = (typeof ASK_AI_TOOLS)[number];

const words = (en: string, hinglish: string, hi: string): StatusWords => ({
    en,
    hinglish,
    hi,
});

const STATUS_WORDS: Record<AskAiTool, StatusWords> = {
    list_bookings: words(
        "Reading your bookings…",
        "Bookings dekh rahe hain…",
        "बुकिंग देख रहे हैं…",
    ),
    get_booking: words(
        "Opening the booking…",
        "Booking khol rahe hain…",
        "बुकिंग खोल रहे हैं…",
    ),
    find_free_slots: words(
        "Finding free times…",
        "Khaali time dhoondh rahe hain…",
        "खाली समय ढूँढ रहे हैं…",
    ),
    get_hours: words(
        "Checking your opening hours…",
        "Khulne ka time dekh rahe hain…",
        "खुलने का समय देख रहे हैं…",
    ),
    list_services: words(
        "Reading your services…",
        "Services dekh rahe hain…",
        "सेवाएँ देख रहे हैं…",
    ),
    list_products: words(
        "Reading your products…",
        "Products dekh rahe hain…",
        "प्रोडक्ट देख रहे हैं…",
    ),
    get_product: words(
        "Opening the product…",
        "Product khol rahe hain…",
        "प्रोडक्ट खोल रहे हैं…",
    ),
    list_orders: words(
        "Reading your orders…",
        "Orders dekh rahe hain…",
        "ऑर्डर देख रहे हैं…",
    ),
    get_order: words(
        "Opening the order…",
        "Order khol rahe hain…",
        "ऑर्डर खोल रहे हैं…",
    ),
    list_customers: words(
        "Looking through your customers…",
        "Customers dekh rahe hain…",
        "ग्राहक देख रहे हैं…",
    ),
    get_customer: words(
        "Opening the customer's details…",
        "Customer ki details khol rahe hain…",
        "ग्राहक की जानकारी खोल रहे हैं…",
    ),
    list_enquiries: words(
        "Reading your enquiries…",
        "Enquiries dekh rahe hain…",
        "पूछताछ देख रहे हैं…",
    ),
    get_enquiry: words(
        "Opening the enquiry…",
        "Enquiry khol rahe hain…",
        "पूछताछ खोल रहे हैं…",
    ),
};

const JOB = `Your job: you are Ask AI. The person runs or works in the business below and asks about it: bookings, free times, opening hours, services, products, orders, customers and enquiries. Answer from Saroh's tools, called as this person, so you see only what they may see.

- Call the fewest tools that answer the question; use their filters (dates, status, search) rather than reading everything.
- Lead with the answer in one or two sentences, then the few details that matter. Short lists, no tables unless asked.
- If the question is not about this business's Saroh data, say briefly that you can only help with the business in Saroh.`;

export const ASK_AI_AGENT: AgentDefinition<AskAiTool> = {
    key: "ask-ai",
    job: JOB,
    houseRules: HOUSE_RULES,
    businessBlock,
    models: {
        questions: {
            model: "askAi.questions.model",
            effort: "askAi.questions.effort",
        },
        drafts: { model: "askAi.drafts.model", effort: "askAi.drafts.effort" },
    },
    tools: ASK_AI_TOOLS,
    draftTools: [],
    statusWords: STATUS_WORDS,
    usageKey: "questions",
};
