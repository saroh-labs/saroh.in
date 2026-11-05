/** What Saroh doesn't do: online orders on the website, reminders, sending on WhatsApp. */
export const NOT_AVAILABLE = [
    /order(ing)? online/,
    /\b(pay|buy|order) (on|from|through) (the|your) (website|site)/,
    /checkout/,
    /add to (cart|bag)/,
    /reminders? (sent|go(es)? out)/,
    /sends? (a |the )?reminders?/,
    /whatsapp (message )?sent/,
    /sent (on|by|via|over) whatsapp/,
    /saroh sends/,
    /buy now/,
    /cart\b/,
    // Class and session packs aren't offered on any plan for now (DEC-099).
    /\b(class|session|lesson) packs?\b/,
    /\bpacks? of (\d|classes|lessons)/,
    /\b(her|his|your) pack\b/,
    /\bcomes? off (each|when)\b/,
];
