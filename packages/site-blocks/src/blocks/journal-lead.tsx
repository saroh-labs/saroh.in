import { cn } from "../lib/utils";

/**
 * The Journal's `lead` look (template polish), as the blog design opens: the
 * newest post on the page, a few paragraphs deep, rather than a card
 * pointing at it — its date, its title set large, its own excerpt, how long
 * it takes to read, its opening paragraphs and "Continue reading".
 *
 * The paragraphs are the post's own body, which the feed already carries,
 * cut to the first few and drawn as TEXT, never as markup: a tag the scan
 * misses shows as characters rather than running. The reading time is only
 * said when there is a body to count. Drawn from `--site-*` only; the accent
 * is used once, on the date.
 */

export interface LeadPost {
    href: string;
    title: string;
    /** "2 Apr 2026"; null behind a preview token for a post not yet out. */
    date: string | null;
    dateTime: string | null;
    /** The post's own excerpt, not one made from its body. */
    dek: string | null;
    /** "About 12 minutes", from the body's length. */
    minutes: string | null;
    paragraphs: string[];
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

export function JournalLead({
    post,
    titled,
}: {
    post: LeadPost;
    /** True when the section draws a title of its own above, so this is h3. */
    titled: boolean;
}) {
    const Title = titled ? "h3" : "h2";
    return (
        <article className="text-site-fg max-w-[var(--site-measure,40rem)]">
            {post.date ? (
                <p className="text-site-accent text-[14px] tracking-[0.04em]">
                    {post.dateTime ? (
                        <time dateTime={post.dateTime}>{post.date}</time>
                    ) : (
                        post.date
                    )}
                </p>
            ) : null}
            <Title className="font-site-heading mt-2 text-[calc(2.75rem*var(--site-heading-scale))] font-medium leading-[1.12] tracking-[-0.02em] [overflow-wrap:anywhere]">
                <a
                    href={post.href}
                    className={cn(
                        "rounded-[var(--site-radius)] underline-offset-[6px] hover:underline",
                        focusRing,
                    )}
                >
                    {post.title}
                </a>
            </Title>
            {post.dek ? (
                <p className="text-site-body mt-4 text-[21px] font-light leading-snug [text-wrap:pretty]">
                    {post.dek}
                </p>
            ) : null}
            {post.minutes ? (
                <p className="text-site-muted mt-3 text-[14px]">
                    {post.minutes}
                </p>
            ) : null}
            {post.paragraphs.length > 0 ? (
                <div className="mt-7 grid gap-5">
                    {post.paragraphs.map((text, i) => (
                        <p
                            key={i}
                            className="text-site-body text-[length:var(--site-body-size,1.15625rem)] leading-[1.74] [text-wrap:pretty]"
                        >
                            {text}
                        </p>
                    ))}
                </div>
            ) : null}
            <p className="mt-6">
                <a
                    href={post.href}
                    className={cn(
                        "text-site-fg rounded-[var(--site-radius)] text-[17px] italic underline underline-offset-4",
                        focusRing,
                    )}
                >
                    Continue reading
                    <span className="sr-only">: {post.title}</span>
                </a>
            </p>
        </article>
    );
}
