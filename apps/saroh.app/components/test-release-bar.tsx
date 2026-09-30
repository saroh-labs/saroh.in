"use client";

import { useEffect, useRef } from "react";

import {
    BAR_HEIGHT_VAR,
    LIVE_OUTSIDE_RELEASE,
} from "@/lib/test-release-chrome";

/**
 * The Test release bar (DEC-071, R5 and R6): on every page of a test host,
 * pinned to the top, and never dismissed.
 *
 * Renderer chrome, like the draft preview's bar, so it is deliberately NOT in
 * the merchant's palette: it is Saroh speaking about the site, not part of
 * it, and it must stay legible on any ground the merchant chose.
 *
 * "What's live" names what a test release does not freeze: those come from
 * the live business, so a reviewer doesn't approve a price or an hour
 * believing the release holds it (R6). The same list is on the "Make a test
 * release" sheet in the workspace.
 *
 * The site's own header is sticky at the top too. The bar tells it how tall
 * it is (`--test-release-bar-h`), so the header sticks below the bar rather
 * than under it; the layout's one rule (`HEADER_BELOW_BAR`) reads it.
 */

export function TestReleaseBar({
    name,
    liveUrl,
}: {
    name: string;
    liveUrl: string | null;
}) {
    const bar = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = bar.current;
        if (!element) return;
        const root = document.documentElement;
        const measure = () =>
            root.style.setProperty(
                BAR_HEIGHT_VAR,
                `${element.getBoundingClientRect().height}px`,
            );
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => {
            observer.disconnect();
            root.style.removeProperty(BAR_HEIGHT_VAR);
        };
    }, []);

    return (
        <div
            ref={bar}
            role="region"
            aria-label="Test release"
            data-test-release-bar=""
            className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-neutral-900 px-4 py-2 text-xs leading-5 text-neutral-100"
        >
            <p className="min-w-0 [overflow-wrap:anywhere]">
                <strong className="font-semibold">Test release</strong>
                {" · "}
                <span data-test-release-name="">{name}</span>
                {" — "}
                Nothing here takes a real order, booking or payment.
            </p>
            <details className="group">
                <summary className="-mx-1.5 cursor-pointer list-none rounded px-1.5 text-neutral-300 underline decoration-neutral-500 underline-offset-2 hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-100 active:bg-neutral-700 [&::-webkit-details-marker]:hidden">
                    What&rsquo;s live
                    <span
                        aria-hidden="true"
                        className="ml-1 inline-block transition-transform group-open:rotate-180"
                    >
                        ▾
                    </span>
                </summary>
                <div className="absolute inset-x-4 top-full mt-1 rounded-md bg-neutral-900 p-3 text-neutral-100 shadow-lg ring-1 ring-neutral-700 sm:left-auto sm:w-80">
                    <p className="text-neutral-300">
                        These come from your live business, not this release:
                    </p>
                    <ul className="mt-2 list-disc space-y-0.5 pl-4">
                        {LIVE_OUTSIDE_RELEASE.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                    {liveUrl ? (
                        <a
                            href={liveUrl}
                            className="-mx-1 mt-3 inline-block cursor-pointer rounded px-1 underline underline-offset-2 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-100 active:bg-neutral-700"
                        >
                            See the live site
                        </a>
                    ) : null}
                </div>
            </details>
        </div>
    );
}
