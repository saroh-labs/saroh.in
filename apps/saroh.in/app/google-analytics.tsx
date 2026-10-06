"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

import { isPreviewPath } from "@/lib/pricing-preview";

/**
 * Google Analytics, on every page but a pricing draft preview (KTD-10), given
 * a measurement id — which the layout passes only on a Vercel production
 * deployment (`lib/ga.ts`). Without one nothing loads, so previews, local dev
 * and the browser tests never reach GA; a staff member checking a draft is
 * not a visit, and the preview address must not reach a third party.
 */
export function GoogleAnalytics({ id }: { id: string | undefined }) {
    const pathname = usePathname();
    if (!id || isPreviewPath(pathname)) return null;
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
