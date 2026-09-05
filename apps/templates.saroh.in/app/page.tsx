import { env } from "@/env";

const API_URL =
    env.API_URL ?? env.NEXT_PUBLIC_API_URL ?? "https://api.saroh.in";

interface TemplateSummary {
    id: string;
    version: number;
    name: string;
    description?: string;
    pages: string[];
}

type CatalogueResult =
    { status: "ok"; templates: TemplateSummary[] } | { status: "unavailable" };

/**
 * Read the catalogue from the public API, never from `@saroh/templates`.
 *
 * The package is the obvious import and the wrong one: it depends on
 * `@saroh/database`, and a frontend reaching into it is exactly the boundary
 * the shared ESLint config refuses. `api.saroh.in` is the only database-facing
 * service, so the showcase asks it.
 */
async function loadTemplates(): Promise<CatalogueResult> {
    let response: Response;
    try {
        response = await fetch(`${API_URL}/public/sites/templates`, {
            headers: { accept: "application/json" },
            // The catalogue changes when a template is registered — a deploy,
            // not a request — so an hour of staleness costs nothing and a cold
            // API does not slow the page down.
            next: { revalidate: 3600 },
        });
    } catch {
        return { status: "unavailable" };
    }

    if (!response.ok) return { status: "unavailable" };

    return {
        status: "ok",
        templates: (await response.json()) as TemplateSummary[],
    };
}

/**
 * What a merchant can actually start a site from.
 *
 * This page used to say "Storefront templates for Saroh sites are on the way.
 * Check back soon." (#107). The templates arrived — `@saroh/templates` holds a
 * real versioned registry and `api.saroh.in` instantiates sites from it — but
 * the page never noticed, so it went on describing the product as emptier than
 * it is. Reading the registry through the API means it cannot drift again.
 *
 * Three outcomes, and each says which one it is rather than looking like the
 * others: templates listed, none registered, or the catalogue could not be
 * reached. An empty page that means "the API is down" and an empty page that
 * means "there is nothing yet" are different facts, and a visitor deciding
 * whether Saroh is worth their time acts on the difference.
 */
export default async function Home() {
    const result = await loadTemplates();
    const templates =
        result.status === "ok"
            ? [...result.templates].sort((a, b) => a.name.localeCompare(b.name))
            : [];

    return (
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
            <h1 className="text-2xl font-semibold">Site templates</h1>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                Every template a new Saroh site can be built from. Each lays
                down a set of pages, already filled in from the business
                profile, which the merchant then edits.
            </p>

            {result.status === "unavailable" ? (
                <p
                    role="status"
                    className="mt-10 rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
                >
                    The template catalogue could not be loaded just now. This is
                    a problem on our side, not an empty catalogue — please try
                    again shortly.
                </p>
            ) : templates.length === 0 ? (
                <p className="mt-10 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                    No templates are registered yet.
                </p>
            ) : (
                <ul className="mt-10 flex flex-col gap-4">
                    {templates.map((template) => (
                        <li
                            key={`${template.id}@${template.version}`}
                            className="rounded-lg border p-5"
                        >
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <h2 className="text-base font-medium">
                                    {template.name}
                                </h2>
                                <span className="text-xs text-muted-foreground">
                                    {template.id} · v{template.version}
                                </span>
                            </div>

                            {template.description ? (
                                <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                                    {template.description}
                                </p>
                            ) : null}

                            {template.pages.length > 0 ? (
                                <p className="mt-3 text-sm">
                                    {template.pages.length}{" "}
                                    {template.pages.length === 1
                                        ? "page"
                                        : "pages"}
                                    :{" "}
                                    <span className="text-muted-foreground">
                                        {template.pages.join(", ")}
                                    </span>
                                </p>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
