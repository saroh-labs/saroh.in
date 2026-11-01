import { ConsoleNotFound } from "@/components/console-not-found";

export const metadata = { title: "Release not found" };

export default function NotFoundPage() {
    return (
        <ConsoleNotFound
            title="Release not found"
            description="There's no release with this code name. The link may be old or mistyped, or the release was retired."
            back={{ href: "/releases", label: "Back to Releases" }}
        />
    );
}
