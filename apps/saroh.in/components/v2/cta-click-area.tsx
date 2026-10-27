"use client";

import type { ReactNode } from "react";

import { track } from "@/lib/analytics";
import type { LaunchMode } from "@/lib/links";
import { ACCOUNTS_URL } from "@/lib/links";
import { keepButtonSource } from "@/lib/referral";

/**
 * Around a page drawn by `@saroh/search-pages` (the /for/ and /tools pages):
 * a click on one of its start buttons (`a[data-cta]`) does what `CtaLink`
 * does — keeps the button's `src` for the business it may make and sends
 * `cta_click` — since the package can't import the site's own button.
 */
export function CtaClickArea({
    src,
    mode,
    children,
}: {
    src: string;
    mode: LaunchMode;
    children: ReactNode;
}) {
    return (
        <div
            className="contents"
            onClickCapture={(e) => {
                const a = (e.target as Element).closest("a[data-cta]");
                if (!a) return;
                keepButtonSource(src, ACCOUNTS_URL);
                track("cta_click", { page: src, mode });
            }}
        >
            {children}
        </div>
    );
}
