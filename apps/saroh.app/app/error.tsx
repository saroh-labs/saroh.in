"use client";

import { ctaClasses, SiteTheme } from "@saroh/site-blocks";
import { useEffect } from "react";

/**
 * Root error boundary for the renderer.
 *
 * This one catches what `[domain]/error.tsx` cannot: a throw inside
 * `[domain]/layout.tsx` itself — the publication fetch failing — belongs to
 * the parent segment, which is here. That is also the case where the
 * merchant's palette does not exist yet, because `SiteTheme` is mounted by the
 * very layout that failed.
 *
 * So it mounts `SiteTheme` with no variables, which emits the neutral stone
 * defaults. That is the honest ground for this page: a visitor who typed a
 * merchant's domain must never be shown Saroh's brand — they did not come to
 * Saroh and have no reason to learn it exists — and guessing at a palette we
 * could not load would be worse than not having one.
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // TODO(#103): forward to error tracking once observability lands.
        console.error(error);
    }, [error]);

    return (
        <>
            <SiteTheme />
            <main className="mx-auto flex min-h-screen w-full max-w-screen-sm flex-col items-center justify-center px-5 py-16 text-center">
                <h1 className="text-3xl font-bold tracking-tight text-site-fg sm:text-4xl">
                    This page isn&rsquo;t loading
                </h1>
                <p className="mt-3 text-base text-site-body">
                    Something went wrong on our side. It is usually temporary.
                </p>
                {error.digest && (
                    <p className="mt-4 font-mono text-xs text-site-muted">
                        Reference: {error.digest}
                    </p>
                )}
                <button
                    onClick={reset}
                    className={`${ctaClasses("primary")} mt-8`}
                >
                    Try again
                </button>
            </main>
        </>
    );
}
