import { webImageUrl } from "@saroh/ui/lib/share-facts";
import { ImageIcon } from "lucide-react";

/**
 * How the page can look on Google and in a WhatsApp share (WXPPageSheet):
 * drawn from what is typed, falling back to what Google and WhatsApp would
 * take without it. A sketch, never a promise: Google may write its own.
 */
export function GooglePreview({
    siteName,
    link,
    title,
    text,
}: {
    siteName: string;
    link: string;
    title: string;
    text: string | null;
}) {
    return (
        <figure
            aria-label="How it can look on Google"
            data-ph-mask=""
            className="grid gap-0.5 rounded-[10px] border border-border bg-card p-3"
        >
            <p className="truncate text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{siteName}</span>
                {" · "}
                {link.replace(/\//g, " › ").replace(/ › $/, "")}
            </p>
            <p className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">
                {title}
            </p>
            <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                {text ?? "Google picks a line from the page."}
            </p>
        </figure>
    );
}

export function SharePreview({
    image,
    title,
    text,
    host,
}: {
    image: string | null;
    title: string;
    text: string | null;
    host: string | null;
}) {
    const src = image ? webImageUrl(image) : null;
    return (
        <figure
            aria-label="How it looks on WhatsApp"
            data-ph-mask=""
            className="grid max-w-[320px] overflow-hidden rounded-[10px] border border-border bg-muted"
        >
            <div className="flex aspect-[1.91/1] items-center justify-center bg-secondary text-muted-foreground">
                {src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL, not a project asset
                    <img
                        src={src}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <ImageIcon aria-hidden className="size-5" />
                )}
            </div>
            <figcaption className="grid gap-0.5 px-3 py-2">
                <span className="line-clamp-1 text-[13px] font-semibold">
                    {title}
                </span>
                {text ? (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                        {text}
                    </span>
                ) : null}
                {host ? (
                    <span className="text-xs text-muted-foreground">
                        {host}
                    </span>
                ) : null}
            </figcaption>
        </figure>
    );
}
