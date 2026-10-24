// Plain helpers for the WhatsApp button (#1188), kept out of the client
// component so the server-rendered page chrome can call them.

/**
 * The number the WhatsApp button opens a chat with (#1188), or null when it
 * is off: only when `NEXT_PUBLIC_WHATSAPP_CHAT` is `on` and the number is
 * digits. Unset is off everywhere, `next dev` included, so a production
 * build that leaves them out renders nothing.
 */
export function whatsappNumber(
    flag: string | undefined,
    number: string | undefined,
): string | null {
    return flag === "on" && number && /^\d{8,15}$/.test(number) ? number : null;
}

/** The page's kind for `whatsapp_click`: its first segment, `home` for `/`. */
export function pageKind(pathname: string): string {
    return pathname.split("/").find(Boolean) ?? "home";
}
