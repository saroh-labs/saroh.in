import BaseLayout from "@/components/layouts/base-layout";

/**
 * The catalog's own chrome — Saroh's header, footer and column.
 *
 * A route GROUP rather than the root layout, because one route must not have
 * it: `/preview/*` renders a single block standing in for a merchant's page,
 * and a Saroh header above it would be precisely the confusion between the two
 * token layers this app exists to make legible. A nested layout cannot remove
 * an ancestor, so the chrome had to move down one level instead.
 *
 * URLs are unchanged — a group's name never appears in a path.
 */
export default function CatalogLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <BaseLayout>{children}</BaseLayout>;
}
