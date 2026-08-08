import { Wordmark } from "@saroh/ui/wordmark";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Saroh app",
    description: "The renderer that serves published Saroh sites.",
    robots: { index: false, follow: false },
};

/**
 * The bare apex of the renderer, reached only when a request arrives without a
 * tenant hostname for middleware to rewrite — a misconfigured DNS record, or
 * someone typing the service host directly.
 *
 * This is the one Saroh-owned surface in this app, so it is the only place here
 * that uses Saroh's brand tokens. Everything under `[domain]/*` is a merchant's
 * own website and is themed from the `--site-*` layer instead.
 *
 * Deliberately says nothing about which sites exist. It replaces a
 * `<div>Home: List of all published sites</div>` placeholder that promised
 * exactly that — enumerating tenants from an unauthenticated endpoint is not
 * something a renderer should offer.
 */
export default function RendererRoot() {
    return (
        <main className="grid min-h-screen place-items-center bg-background px-6">
            <div className="w-full max-w-md text-center">
                <div className="mb-6 flex justify-center">
                    <Wordmark suffix="app" />
                </div>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                    Nothing is published at this address
                </h1>
                <p className="mt-3 text-sm text-muted-foreground">
                    This host serves published Saroh sites. If you reached this
                    page from your own domain, its DNS is pointed here but no
                    site is published for it yet.
                </p>
                <a
                    href="https://saroh.in"
                    className="mt-6 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
                >
                    Learn about Saroh
                </a>
            </div>
        </main>
    );
}
