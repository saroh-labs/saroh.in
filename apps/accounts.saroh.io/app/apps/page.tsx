"use client";
import { Button } from "@saroh/ui/button";
import { signOut } from "next-auth/react";
import Link from "next/link";

const apps = [
    {
        name: "Admin",
        devUrl: "http://localhost:3001",
        prodUrl: "https://admin.saroh.io",
    },
    {
        name: "AI",
        devUrl: "http://localhost:3002",
        prodUrl: "https://ai.saroh.io",
    },
    {
        name: "Application",
        devUrl: "http://localhost:3003",
        prodUrl: "https://application.saroh.io",
    },
    {
        name: "Chatbot",
        devUrl: "http://localhost:3004",
        prodUrl: "https://chatbot.saroh.io",
    },
    {
        name: "Dashboard",
        devUrl: "http://localhost:3005",
        prodUrl: "https://dashboard.saroh.io",
    },
    {
        name: "Docs",
        devUrl: "http://localhost:3006",
        prodUrl: "https://docs.saroh.io",
    },
    {
        name: "Email",
        devUrl: "http://localhost:3007",
        prodUrl: "https://email.saroh.io",
    },
    {
        name: "Sites",
        devUrl: "http://localhost:3009",
        prodUrl: "https://sites.saroh.io",
    },
    {
        name: "Templates",
        devUrl: "http://localhost:3010",
        prodUrl: "https://templates.saroh.io",
    },
    {
        name: "UI",
        devUrl: "http://localhost:3011",
        prodUrl: "https://ui.saroh.io",
    },
    {
        name: "Website",
        devUrl: "http://localhost:3012",
        prodUrl: "https://saroh.io",
    },
];

export default function AppsListPage() {
    const isProduction = process.env.NODE_ENV === "production";
    return (
        <div className="flex flex-col items-center justify-center gap-2 p-8 ">
            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white p-8">
                <Button onClick={() => signOut()}>Sign Out</Button>
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
