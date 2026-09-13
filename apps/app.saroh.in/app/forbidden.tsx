import { AccessDenied } from "@/components/shared/access-denied";

/**
 * App-root 403, for a `forbidden()` outside `(shell)` and `(editor)`, which
 * have their own (#274). Like `not-found.tsx` beside it, it keeps a denial from
 * falling through to Next's default page.
 */
export default function Forbidden() {
    return <AccessDenied />;
}
