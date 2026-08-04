import { redirect } from "next/navigation";

/**
 * `/communications` resolves to the providers screen — see `payments/page.tsx`.
 * The other half of the same audit finding: the Communications "Fix" button
 * pointed at a route that was never built, and messaging setup is connecting a
 * provider, which lives on the providers screen with the rest.
 */
export default function CommunicationsPage() {
    redirect("/settings/providers");
}
