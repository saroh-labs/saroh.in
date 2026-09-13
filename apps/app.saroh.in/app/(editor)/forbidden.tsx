import { AccessDenied } from "@/components/shared/access-denied";

/**
 * A 403 inside the full-screen editor (#274).
 *
 * The editor has no rail, so the way back is the sites list. "Back to Home"
 * would drop someone out of the Website module entirely.
 */
export default function Forbidden() {
    return <AccessDenied backHref="/sites" backLabel="Back to sites" />;
}
