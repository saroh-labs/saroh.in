import Link from "next/link";

export function Breadcrumb({
    crumbs,
}: {
    crumbs: readonly { name: string; path?: string }[];
}) {
    return (
        <nav aria-label="Breadcrumb" className="text-sm text-quiet">
            {crumbs.map((c, i) => (
                <span key={c.name}>
                    {i > 0 ? <span aria-hidden="true"> › </span> : null}
                    {c.path ? (
                        <Link
                            prefetch={false}
                            href={c.path}
                            className="inline-flex min-h-11 items-center underline-offset-2 md:min-h-0"
                        >
                            {c.name}
                        </Link>
                    ) : (
                        <span aria-current="page">{c.name}</span>
                    )}
                </span>
            ))}
        </nav>
    );
}
