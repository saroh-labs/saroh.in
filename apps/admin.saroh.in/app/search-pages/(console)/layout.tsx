import { AdminShell } from "@/components/admin-shell";
import { searchPagesGate } from "@/lib/search-pages";

/**
 * The console around the list and each page (owner, 1 Nov): drawn once, so
 * ‹ Previous / Next › and the tabs swap only what's inside it, under
 * placeholder shapes (`[slug]/loading.tsx`). The bare preview route
 * (`../[slug]/preview`) stays outside, with no console chrome.
 */
export default async function SearchPagesConsoleLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const gate = await searchPagesGate();
    if (!gate.ok) return gate.screen;
    return <AdminShell staff={gate.staff}>{children}</AdminShell>;
}
