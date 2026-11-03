"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { track } from "@/lib/analytics";

/** A page view, and a click on anything marked `data-cta`. */
export function Analytics() {
    const pathname = usePathname();
    useEffect(() => track("$pageview"), [pathname]);
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (!(e.target instanceof Element)) return;
            const cta = e.target
                .closest("[data-cta]")
                ?.getAttribute("data-cta");
            if (cta) track("cta_click", { cta });
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, []);
    return null;
}
