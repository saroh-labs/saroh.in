import { ConsoleNotFound } from "@/components/console-not-found";

export const metadata = { title: "User not found" };

export default function NotFoundPage() {
    return (
        <ConsoleNotFound
            title="User not found"
            description="There's no user at this address. The link may be old or mistyped, or the account was removed."
            back={{ href: "/users", label: "Back to Users" }}
        />
    );
}
