import { NotFound } from "@saroh/ui/not-found";

/**
 * The templates site's 404, under the layout's header. The site is one page
 * of templates, so that is the way on.
 */
export default function NotFoundPage() {
    return (
        <main>
            <NotFound
                title="Page not found"
                description="There's no page at this address. The link may be old or mistyped."
                primary={{ href: "/", label: "See the templates" }}
            />
        </main>
    );
}
