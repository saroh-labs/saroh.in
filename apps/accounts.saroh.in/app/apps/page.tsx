"use client";
import { authClient } from "@/lib/auth.client";
import { Button } from "@saroh/ui/button";
import Link from "next/link";

const apps = [
    {
        name: "Admin",
        devUrl: "http://localhost:3001",
        prodUrl: "https://admin.saroh.in",
    },
    {
        name: "AI",
        devUrl: "http://localhost:3002",
        prodUrl: "https://ai.saroh.in",
    },
    {
        name: "Application",
        devUrl: "http://localhost:3003",
        prodUrl: "https://application.saroh.in",
    },
    {
        name: "Chatbot",
        devUrl: "http://localhost:3004",
        prodUrl: "https://chatbot.saroh.in",
    },
    {
        name: "Dashboard",
        devUrl: "http://localhost:3005",
        prodUrl: "https://dashboard.saroh.in",
    },
    {
        name: "Docs",
        devUrl: "http://localhost:3006",
        prodUrl: "https://docs.saroh.in",
    },
    {
        name: "Email",
        devUrl: "http://localhost:3007",
        prodUrl: "https://email.saroh.in",
    },
    {
        name: "Sites",
        devUrl: "http://localhost:3009",
        prodUrl: "https://sites.saroh.in",
    },
    {
        name: "Templates",
        devUrl: "http://localhost:3010",
        prodUrl: "https://templates.saroh.in",
    },
    {
        name: "UI",
        devUrl: "http://localhost:3011",
        prodUrl: "https://ui.saroh.in",
    },
    {
        name: "Website",
        devUrl: "http://localhost:3012",
        prodUrl: "https://saroh.in",
    },
];

export default function AppsListPage() {
    const isProduction = process.env.NODE_ENV === "production";
    const {
        data: session,
        isPending,
        error,
        refetch,
    } = authClient.useSession();
    console.log(session);
    if (isPending) {
        return <div>Loading...</div>;
    }
    if (error) {
        return <div>Error: {error.message}</div>;
    }
    return (
        <div className="flex flex-col items-center justify-center gap-2 p-8 ">
            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white p-8">
                <Button onClick={() => authClient.signOut()}>Sign Out</Button>
                <div className="flex flex-col gap-2 text-2xl font-bold">
                    Select the app to open
                </div>
                <div className="flex flex-col gap-2 p-8 ">
                    {apps.map((app) => (
                        <Link
                            key={app.name}
                            href={isProduction ? app.prodUrl : app.devUrl}
                            className="rounded-md p-2 hover:bg-gray-100"
                        >
                            {app.name}
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
