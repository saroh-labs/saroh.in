import { Button } from "@saroh/ui/button";
import Link from "next/link";

/**
 * App-root 404. Rendered for `notFound()` (e.g. a cross-tenant or missing id)
 * and unmatched routes, styled to match the app instead of Next's default.
 */
export default function NotFound() {
    return (
        <main className="mx-auto flex max-w-4xl flex-col items-center gap-4 p-16 text-center">
            <h1 className="text-2xl font-semibold">Page not found</h1>
            <p className="max-w-md text-sm text-muted-foreground">
                The page you&apos;re looking for doesn&apos;t exist, or you
                don&apos;t have access to it.
            </p>
            <Button asChild>
                <Link href="/">Back to dashboard</Link>
            </Button>
        </main>
    );
}
