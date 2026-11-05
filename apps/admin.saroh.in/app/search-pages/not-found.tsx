import { ConsoleNotFound } from "@/components/console-not-found";

export const metadata = { title: "Search page not found" };

export default function NotFoundPage() {
    return (
        <ConsoleNotFound
            title="Search page not found"
            description="There's no search page at this address. The link may be old or mistyped, or the page was removed."
            back={{ href: "/search-pages", label: "Back to Search pages" }}
        />
    );
}
