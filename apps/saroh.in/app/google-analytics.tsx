"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

import { isPreviewPath } from "@/lib/pricing-preview";

/**
 * Google Analytics, on every page but a pricing draft preview (KTD-10): a
 * staff member checking a draft is not a visit, and the preview address
 * must not reach a third party.
 */
export function GoogleAnalytics() {
    const pathname = usePathname();
    if (isPreviewPath(pathname)) return null;
    return (
        <>
            <Script
                async
                src="https://www.googletagmanager.com/gtag/js?id=G-L19ZLH2N5K"
            ></Script>
            <Script id="google-analytics">
                {` window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-L19ZLH2N5K');`}
            </Script>
        </>
    );
}
