import { ConsoleNotFound } from "@/components/console-not-found";

export const metadata = { title: "Business not found" };

export default function NotFoundPage() {
    return (
        <ConsoleNotFound
            title="Business not found"
            description="There's no business at this address. The link may be old or mistyped, or the business was removed."
            back={{ href: "/businesses", label: "Back to Businesses" }}
        />
    );
}
