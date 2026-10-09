import { NotFound } from "@saroh/ui/not-found";
import { Wordmark } from "@saroh/ui/wordmark";

/**
 * App-root 404, outside the workspace shell: an unmatched address, or a
 * `notFound()` from a route with no 404 of its own (first run, the editor).
 * Whoever lands here may be signed out or have no business yet, so there is
 * no rail to fall back on: the wordmark says where they are, and Home is the
 * way on (it sends a signed-out visitor to sign in).
 */
export default function NotFoundPage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-background">
            <NotFound
                mark={<Wordmark />}
                title="Page not found"
                description="This address isn't a page in Saroh. The link may be old or mistyped."
                primary={{ href: "/", label: "Back to Home" }}
            />
        </main>
    );
}
