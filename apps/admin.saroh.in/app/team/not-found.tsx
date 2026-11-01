import { ConsoleNotFound } from "@/components/console-not-found";

export const metadata = { title: "Teammate not found" };

export default function NotFoundPage() {
    return (
        <ConsoleNotFound
            title="Teammate not found"
            description="There's no one on the team at this address. The link may be old or mistyped, or their access was removed."
            back={{ href: "/team", label: "Back to Team" }}
        />
    );
}
