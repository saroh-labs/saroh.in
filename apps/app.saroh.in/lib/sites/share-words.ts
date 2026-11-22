/**
 * What Share this page starts its messages with (plan 2026-11-18-001 U12,
 * WXSShare): a WhatsApp message and an Instagram caption composed from the
 * page's own words, its title and its text for Google, and nothing else.
 * No AI and no claim the page doesn't make ("new", "best", a price), so
 * the merchant can send it as it stands. Pure, so it is tested apart.
 */

/** The page as the messages read it. */
export interface SharePageWords {
    title: string;
    /** The page's text for Google; none: the messages use the title alone. */
    seoDescription?: string | null;
    isHome?: boolean;
}

/** One line, with a full stop when it ends without one. */
export function asSentence(text: string): string {
    const line = text.replace(/\s+/g, " ").trim();
    if (line === "") return "";
    return /[.!?…]$/.test(line) ? line : `${line}.`;
}

/** The first sentence of `text`, as a sentence. */
export function firstSentence(text: string): string {
    const line = asSentence(text);
    return line.split(/(?<=[.!?…])\s/)[0] ?? line;
}

/** What the page is called in a message: the business itself for its home. */
function nameOf(page: SharePageWords, business: string): string {
    const title = page.title.trim();
    const same = title.toLowerCase() === business.trim().toLowerCase();
    return page.isHome || same || title === "" ? business.trim() : title;
}

/**
 * "Bridal makeup packages at Gulmohar. <Google text> See it here: <link>";
 * the home page is the business: "Gulmohar: <Google text> See it here: …".
 */
export function whatsappMessage(
    page: SharePageWords,
    business: string,
    link: string,
): string {
    const name = nameOf(page, business);
    const text = asSentence(page.seoDescription ?? "");
    const home = name === business.trim();
    const lead = home
        ? text
            ? `${name}: ${text}`
            : asSentence(name)
        : [asSentence(`${name} at ${business.trim()}`), text]
              .filter(Boolean)
              .join(" ");
    return `${lead} See it here: ${link}`;
}

/** "Bridal makeup packages: <first sentence of the Google text> Link in bio: <link>". */
export function instagramCaption(
    page: SharePageWords,
    business: string,
    link: string,
): string {
    const name = nameOf(page, business);
    const text = firstSentence(page.seoDescription ?? "");
    const lead = text ? `${name}: ${text}` : asSentence(name);
    return `${lead} Link in bio: ${link}`;
}
