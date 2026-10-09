import { NotFound } from "@saroh/ui/not-found";
import { Wordmark } from "@saroh/ui/wordmark";

/**
 * Accounts' 404, on the same backdrop as every other screen here (the root
 * layout draws it). Signing in lands on Your apps, so that is the way on;
 * someone who is signed out is sent from there to sign in, and Sign in is
 * offered beside it for them.
 */
export default function NotFoundPage() {
    return (
        <main className="flex min-h-screen items-center justify-center">
            <NotFound
                mark={<Wordmark style={{ fontSize: "1.75rem" }} />}
                title="Page not found"
                description="This address isn't a page in your Saroh account. The link may be old or mistyped."
                primary={{ href: "/apps", label: "Go to your apps" }}
                secondary={{ href: "/login", label: "Sign in" }}
            />
        </main>
    );
}
