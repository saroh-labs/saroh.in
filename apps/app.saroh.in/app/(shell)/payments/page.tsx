import { redirect } from "next/navigation";

/**
 * `/payments` resolves to the providers screen.
 *
 * One of the three destinations the 2026-08-02 audit found terminating in "Page
 * not found": `/settings/providers` offered a "Fix" button for Payments that
 * pointed here, and here did not exist. The API stopped emitting the link some
 * time ago and `pnpm check:routes` now fails the build if anything reintroduces
 * it — but a merchant who bookmarked the button, or followed a link sent before
 * the change, still landed on a 404.
 *
 * Payments has no screen of its own: connecting a provider IS the payments
 * setup, and it lives with the other providers. A redirect rather than a stub
 * page, so there is no second surface to drift from the first.
 */
export default function PaymentsPage() {
    redirect("/settings/providers");
}
