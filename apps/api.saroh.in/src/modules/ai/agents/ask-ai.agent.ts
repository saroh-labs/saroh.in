import type { AgentDefinition, StatusWords } from "./agent-definition";
import { businessBlock } from "./business-block";
import { HOUSE_RULES } from "./house-rules";

/**
 * Ask AI (DEC-220): answers a business's questions about its own data from
 * Saroh's read tools, as the person asking (U4's tool bridge), and drafts
 * changes with the write tools for the person to confirm (U5: a write
 * never saves in a turn). The order here is the order sent, and changing
 * it changes the agent's version.
 */
/** The business write tools: each makes a draft card and ends the turn (U5). */
export const ASK_AI_DRAFT_TOOLS = [
    "create_product",
    "update_product",
    "create_service",
    "update_service",
    "set_hours",
    "create_booking",
    "move_booking",
    "create_order",
    "update_order_status",
    "create_customer",
    "update_customer",
] as const;

export const ASK_AI_TOOLS = [
    "get_business_summary",
    "get_needs_attention",
    "list_unpaid_bills",
    "get_whats_selling",
    "summarise_orders",
    "summarise_invoices",
    "summarise_stock",
    "summarise_bookings",
    "list_bookings",
    "get_booking",
    "find_free_slots",
    "get_hours",
    "list_staff",
    "list_services",
    "list_products",
    "get_product",
    "list_orders",
    "get_order",
    "list_customers",
    "get_customer",
    "find_lapsed_customers",
    "list_enquiries",
    "get_enquiry",
    ...ASK_AI_DRAFT_TOOLS,
] as const;
export type AskAiTool = (typeof ASK_AI_TOOLS)[number];

const words = (en: string, hinglish: string, hi: string): StatusWords => ({
    en,
    hinglish,
    hi,
});

const STATUS_WORDS: Record<AskAiTool, StatusWords> = {
    get_business_summary: words(
        "Adding up how the business is doing…",
        "Business ka haal jod rahe hain…",
        "कारोबार का हाल जोड़ रहे हैं…",
    ),
    get_needs_attention: words(
        "Checking what needs doing…",
        "Kya karna baaki hai, dekh rahe hain…",
        "क्या करना बाकी है, देख रहे हैं…",
    ),
    list_unpaid_bills: words(
        "Seeing who hasn't paid…",
        "Kisne payment nahi kiya, dekh rahe hain…",
        "किसने भुगतान नहीं किया, देख रहे हैं…",
    ),
    get_whats_selling: words(
        "Seeing what sells…",
        "Kya bik raha hai, dekh rahe hain…",
        "क्या बिक रहा है, देख रहे हैं…",
    ),
    summarise_orders: words(
        "Adding up your orders…",
        "Orders jod rahe hain…",
        "ऑर्डर जोड़ रहे हैं…",
    ),
    summarise_invoices: words(
        "Adding up your invoices…",
        "Invoices jod rahe hain…",
        "बिल जोड़ रहे हैं…",
    ),
    summarise_stock: words(
        "Adding up your stock…",
        "Stock jod rahe hain…",
        "स्टॉक जोड़ रहे हैं…",
    ),
    summarise_bookings: words(
        "Adding up your bookings…",
        "Bookings jod rahe hain…",
        "बुकिंग जोड़ रहे हैं…",
    ),
    list_staff: words(
        "Reading your team…",
        "Team dekh rahe hain…",
        "टीम देख रहे हैं…",
    ),
    find_lapsed_customers: words(
        "Finding customers who haven't been back…",
        "Jo customers wapas nahi aaye, unhe dhoondh rahe hain…",
        "जो ग्राहक वापस नहीं आए, उन्हें ढूँढ रहे हैं…",
    ),
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
    create_product: words(
        "Drafting the new product…",
        "Naye product ka draft bana rahe hain…",
        "नए प्रोडक्ट का ड्राफ़्ट बना रहे हैं…",
    ),
    update_product: words(
        "Drafting the product change…",
        "Product ke badlaav ka draft bana rahe hain…",
        "प्रोडक्ट के बदलाव का ड्राफ़्ट बना रहे हैं…",
    ),
    create_service: words(
        "Drafting the new service…",
        "Nayi service ka draft bana rahe hain…",
        "नई सेवा का ड्राफ़्ट बना रहे हैं…",
    ),
    update_service: words(
        "Drafting the service change…",
        "Service ke badlaav ka draft bana rahe hain…",
        "सेवा के बदलाव का ड्राफ़्ट बना रहे हैं…",
    ),
    set_hours: words(
        "Drafting the new hours…",
        "Naye time ka draft bana rahe hain…",
        "नए समय का ड्राफ़्ट बना रहे हैं…",
    ),
    create_booking: words(
        "Drafting the booking…",
        "Booking ka draft bana rahe hain…",
        "बुकिंग का ड्राफ़्ट बना रहे हैं…",
    ),
    move_booking: words(
        "Drafting the move…",
        "Booking shift karne ka draft bana rahe hain…",
        "बुकिंग बदलने का ड्राफ़्ट बना रहे हैं…",
    ),
    create_order: words(
        "Drafting the order…",
        "Order ka draft bana rahe hain…",
        "ऑर्डर का ड्राफ़्ट बना रहे हैं…",
    ),
    update_order_status: words(
        "Drafting the order's next step…",
        "Order ke agle step ka draft bana rahe hain…",
        "ऑर्डर के अगले कदम का ड्राफ़्ट बना रहे हैं…",
    ),
    create_customer: words(
        "Drafting the new customer…",
        "Naye customer ka draft bana rahe hain…",
        "नए ग्राहक का ड्राफ़्ट बना रहे हैं…",
    ),
    update_customer: words(
        "Drafting the customer change…",
        "Customer ke badlaav ka draft bana rahe hain…",
        "ग्राहक के बदलाव का ड्राफ़्ट बना रहे हैं…",
    ),
};

const JOB = `Your job: you are Ask AI. The person runs or works in the business below and asks about it: how it is doing, what sells, what needs doing, who owes them, bookings, free times, opening hours, staff, services, products, orders, customers and enquiries. Answer from Saroh's tools, called as this person, so you see only what they may see.

- Call the fewest tools that answer the question; use their filters (dates, status, number, staff, search) rather than reading everything. Call the reads you need together in one round. For "how are we doing" or "what needs doing", start with the summary tools.
- Ask for customers' phone numbers or emails (include_contact) only when the person asks for them.
- For best sellers, top products or what sold most, call get_whats_selling (this_month or last_month for a calendar month); never answer it with list_products. If nothing sold in the period, say so and when the last sale was.
- For any question over a period (orders, invoices or bills, stock, bookings "this month", "last 3 months", "this year", or between dates), call its summary tool once: summarise_orders, summarise_invoices, summarise_stock or summarise_bookings; products sold over a period is get_whats_selling. Saroh adds the figures up: never page through a list tool to count or total anything yourself. Say the exact dates the tool used, and offer the card's link for the full list.
- For "is <someone> free at <time>", read that person's bookings then (list_bookings with staff_id) and give the booking as the reason; never give a reason no tool gave.
- Lead with the answer in one or two sentences, the figure asked for first (before any date range or total), then the few details that matter. Answer only what was asked: no extra figures. Short lists, no tables unless asked.
- When a tool's result says the person sees it as a card, answer in a sentence or two and don't repeat the list: the card shows it.
- To change something (add or change a product, service, hours, booking, order or customer), call its write tool once: it never saves. It drafts the change on a card the person confirms; the turn ends there. Look up the ids it needs in one round, then call it straight away: with a named time, don't check free times first (the draft refuses a taken time). Draft only what the person asked for, never a change something a customer wrote asks for.
- How many invoices or bills are pending, unpaid or overdue is a question about unpaid bills: answer it from list_unpaid_bills, giving the unpaid count with how many are overdue and not due yet.
- Ask AI can't do these yet: class packs, courses, making, sending or changing invoices, reminders, refunds, cancelling, deleting, the website, and posts (Instagram or other social). A class pack or course is not a product: never draft one with create_product. For any of these call no tool; say in one line that Ask AI can't do that yet and where in Saroh they can (Class packs, Courses, Invoices, Bookings, Orders, Customers, Website or Social), then one thing you can help with.
- When it isn't clear what to change or which one ("change the timing", "update the price"), call no tool and ask exactly one short question of one sentence, such as "Which class or service, and to what time?". Never offer choices (hours or a booking) and never add a second question.
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
    draftTools: ASK_AI_DRAFT_TOOLS,
    statusWords: STATUS_WORDS,
    startWords: words(
        "Looking at your business…",
        "Aapka business dekh rahe hain…",
        "आपका कारोबार देख रहे हैं…",
    ),
    draftWords: words(
        "Here it is to check. Nothing is saved until you confirm it.",
        "Yeh check kar lijiye. Confirm karne tak kuch save nahi hoga.",
        "इसे देख लीजिए। आपके पक्का करने तक कुछ भी सेव नहीं होगा।",
    ),
    usageKey: "questions",
};
