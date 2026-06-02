import { SignOutButton } from "@/components/sign-out-button";
import { requireSession } from "@/lib/session";

export default async function Home() {
    const session = await requireSession();

    return (
        <main className="p-8">
            <div className="mb-6 flex items-center justify-between">
                <span className="text-sm">
                    Signed in as {session.user.email}
                </span>
                <SignOutButton />
            </div>
            <h1 className="text-xl font-semibold">Saroh dashboard</h1>
            <p className="text-muted-foreground mt-2 text-sm">
                Store management coming online.
            </p>
        </main>
    );
}
