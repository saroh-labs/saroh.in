"use client";

import Script from "next/script";

/**
 * Google Analytics, on every page, given a measurement id — which the
 * layout passes only on a Vercel production deployment (`lib/ga.ts`).
 * Without one nothing loads, so previews, local dev and the browser tests
 * never reach GA.
 */
export function GoogleAnalytics({ id }: { id: string | undefined }) {
    if (!id) return null;
    return (
        <>
            <Script
                async
                src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
            ></Script>
            <Script id="google-analytics">
                {` window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${id}');`}
            </Script>
        </>
    );
}
