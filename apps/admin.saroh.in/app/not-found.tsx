import { ConsoleNotFound } from "@/components/console-not-found";

export const metadata = { title: "Page not found" };

export default function NotFoundPage() {
    return (
        <ConsoleNotFound
            title="Page not found"
            description="Nothing in this console lives at this address. The link may be old or mistyped, or the record was removed."
            back={{ href: "/", label: "Back to the console" }}
        />
    );
}
