import { redirect } from "next/navigation";

/**
 * `/stores` resolves to Commerce.
 *
 * This was one of the three destinations the 2026-08-02 audit found terminating
 * in "Page not found" — and the worst of them, because Home's only `Overdue`
 * row, the single revenue-bearing action in the product, pointed here. Nothing
 * emits the link any more (`pnpm check:routes` fails the build if anything
 * does), but `/stores/new` and `/stores/[storeId]` both exist, so a merchant who
 * trims a URL back to its parent, or follows a bookmark from before the change,
 * still landed on a 404 for a path the app plainly owns.
 *
 * Commerce IS the list of stores, so this is a redirect rather than a duplicate
 * screen: one place lists sales channels, and there is no second one to drift
 * from it.
 */
export default function StoresIndexPage() {
    redirect("/commerce");
}
