import { AccessDenied } from "@/components/shared/access-denied";

/**
 * Renders when a read inside the workspace got a 403 and `getJson` called
 * `forbidden()` (#274).
 *
 * It lives inside `(shell)`, so the rail and header stay: a denial on one page
 * must not take away the way to every other page. The status reaches this
 * boundary in a production build, where an `error.tsx` would only have seen a
 * digest.
 */
export default function Forbidden() {
    return <AccessDenied />;
}
