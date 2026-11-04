import { Breadcrumbs } from "@saroh/marketing/breadcrumbs";

export function Breadcrumb({
    crumbs,
}: {
    crumbs: readonly { name: string; path?: string }[];
}) {
    return (
        <Breadcrumbs
            crumbs={crumbs.map((c) => ({ name: c.name, href: c.path }))}
        />
    );
}
