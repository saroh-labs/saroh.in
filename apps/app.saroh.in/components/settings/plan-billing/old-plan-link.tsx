"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PLANS_HREF } from "./styles";

/**
 * A link made before the plans had a screen of their own
 * (`/settings/billing#change-plan`, in emails Saroh has already sent):
 * the server never sees a `#`, so the page sends it on from the browser.
 * One with `?plan=` is redirected by the page itself.
 */
export function OldPlanLink() {
    const router = useRouter();
    useEffect(() => {
        const send = () => {
            if (window.location.hash === "#change-plan") {
                router.replace(PLANS_HREF);
            }
        };
        send();
        window.addEventListener("hashchange", send);
        return () => window.removeEventListener("hashchange", send);
    }, [router]);
    return null;
}
