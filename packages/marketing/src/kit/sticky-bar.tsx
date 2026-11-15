"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

/** Set on `<html>` while the bar shows, so the header can drop its own start button. */
export const STICKY_CTA_ATTR = "data-sticky-cta";

/**
 * The phone's one sticky action (PHONE.md, KIT.md): a 64px white bar with a
 * hairline on top, holding the page's start button, that slides up once the
 * hero's own button (`watch`, its id) has scrolled away. While it shows,
 * `<html>` carries `data-sticky-cta`, and the header hides its Start free
 * (`STICKY_HIDES`), so there is only ever one. Phones only; from 760px wide
 * it never draws. The button comes from the site (`cta()`), never this file.
 */
export function StickyBar({
    watch,
    children,
}: {
    /** The id of the hero's own CTA. */
    watch: string;
    children: ReactNode;
}) {
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const target = document.getElementById(watch);
        if (!target) return;
        const seen = new IntersectionObserver(([e]) => {
            // Shown once the hero's button is above the window, not below it.
            setShown(!e.isIntersecting && e.boundingClientRect.top < 0);
        });
        seen.observe(target);
        return () => seen.disconnect();
    }, [watch]);

    useEffect(() => {
        const html = document.documentElement;
        if (shown) html.setAttribute(STICKY_CTA_ATTR, "");
        else html.removeAttribute(STICKY_CTA_ATTR);
        return () => html.removeAttribute(STICKY_CTA_ATTR);
    }, [shown]);

    return (
        <div
            data-shown={shown || undefined}
            className="fixed inset-x-0 bottom-0 z-40 h-16 translate-y-full border-t border-border bg-card px-5 py-2 shadow-[0_-6px_18px_-10px_rgba(40,30,15,0.25)] transition-transform duration-base ease-out data-[shown]:translate-y-0 motion-reduce:transition-none min-[760px]:hidden [&>*]:w-full"
            // Out of the tab order and the reading order until it shows.
            inert={!shown}
        >
            {children}
        </div>
    );
}

/** On the header's phone start button: hidden while the sticky bar shows. */
export const STICKY_HIDES = "[html[data-sticky-cta]_&]:hidden";
