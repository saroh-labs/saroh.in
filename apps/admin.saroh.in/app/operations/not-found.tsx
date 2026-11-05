import { ConsoleNotFound } from "@/components/console-not-found";

export const metadata = { title: "Run not found" };

export default function NotFoundPage() {
    return (
        <ConsoleNotFound
            title="Run not found"
            description="There's no bulk run at this address. The link may be old or mistyped. Runs start from Jobs and Webhooks."
            back={{ href: "/operations/jobs", label: "Back to Jobs" }}
        />
    );
}
