"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { track } from "@/lib/analytics";
import { readChoices, subscribeConsent } from "@/lib/consent";

/** Before the browser has been asked (the server's render). */
const UNREAD = "unread";

/** The cookie notice (`app/site-tags.tsx`), which this button never covers. */
const NOTICE = 'section[aria-label="Cookies"]';

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

/**
 * The floating "Chat with us on WhatsApp" button on the V2 pages (#1188),
 * bottom-right. It opens `wa.me` with a ready message naming the page.
 *
 * Under 520px the cookie notice runs full width along the bottom; while it
 * may be showing (an answer is still open), the button sits above it. It
 * stays under the phone menu (z-50, full screen), which hides it.
 */
export function WhatsAppChat({
    number,
    asksConsent,
}: {
    /** From {@link whatsappNumber}; null renders nothing. */
    number: string | null;
    /** Whether this deployment's cookie notice can ask anything at all. */
    asksConsent: boolean;
}) {
    const pathname = usePathname();
    const choices = useSyncExternalStore(
        subscribeConsent,
        readChoices,
        () => UNREAD,
    );
    // shortcut: "an answer is missing" can over-lift (a browser that opts out
    // shows no notice); the measured height is then 0, so nothing moves.
    const lifted = asksConsent && choices !== UNREAD && choices.includes("-");
    const [noticeHeight, setNoticeHeight] = useState(0);

    useEffect(() => {
        if (!lifted) return;
        const measure = () =>
            setNoticeHeight(
                document.querySelector(NOTICE)?.getBoundingClientRect()
                    .height ?? 0,
            );
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [lifted, choices]);

    if (!number) return null;
    const message = `Hi Saroh, I'm on saroh.in${pathname === "/" ? "" : pathname} and have a question.`;
    return (
        <a
            href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat with us on WhatsApp"
            title="Chat with us on WhatsApp"
            data-lifted={lifted ? "true" : undefined}
            style={
                lifted
                    ? ({
                          "--notice-h": `${noticeHeight}px`,
                      } as React.CSSProperties)
                    : undefined
            }
            onClick={() =>
                track("whatsapp_click", { page: pageKind(pathname) })
            }
            className="fixed bottom-5 right-5 z-30 inline-flex size-14 items-center justify-center rounded-full bg-foreground text-background no-underline shadow-mk-menu transition-[background-color,transform,bottom] duration-fast ease-out hover:bg-mk-ink-hover hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:scale-[0.97] motion-reduce:transition-none data-[lifted]:max-[519px]:bottom-[calc(var(--notice-h)+1.5rem)]"
        >
            <svg aria-hidden viewBox="0 0 24 24" width={26} height={26}>
                <path
                    fill="currentColor"
                    d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"
                />
            </svg>
        </a>
    );
}
