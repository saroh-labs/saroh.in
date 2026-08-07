"use client";
import { env } from "@/env";
import { authClient } from "@/lib/auth.client";
import { Button } from "@saroh/ui/button";
import { Card, CardContent } from "@saroh/ui/card";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

const apps = [
    {
        name: "Application",
        blurb: "Your workspace — stores, sites, orders.",
        devUrl: "http://localhost:3003",
        prodUrl: "https://app.saroh.in",
    },
    {
        name: "Admin",
        blurb: "Platform control plane.",
        devUrl: "http://localhost:3001",
        prodUrl: "https://admin.saroh.in",
    },
    {
        name: "Sites",
        blurb: "Published storefronts and pages.",
        devUrl: "http://localhost:3009",
        prodUrl: "https://sites.saroh.in",
    },
    {
        name: "Templates",
        blurb: "Storefront templates.",
        devUrl: "http://localhost:3010/ecommerce",
        prodUrl: "https://templates.saroh.in",
    },
    {
        name: "Docs",
        blurb: "Guides and API reference.",
        devUrl: "http://localhost:3006",
        prodUrl: "https://docs.saroh.in",
    },
    {
        name: "UI",
        blurb: "The design system.",
        devUrl: "http://localhost:3011",
        prodUrl: "https://ui.saroh.in",
    },
    {
        name: "Website",
        blurb: "The marketing site.",
        // The marketing app dev-serves on 3008 (see its package.json `dev`
        // script); this pointed at 3012, which nothing listens on.
        devUrl: "http://localhost:3008",
        prodUrl: "https://saroh.in",
    },
];

const STAGGER_MS = 50;

export default function AppsListPage() {
    const isProduction = env.NODE_ENV === "production";
    const { data: session, isPending, error } = authClient.useSession();

    return (
        <div className="flex min-h-screen flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
            <div
                className="sa-rise mb-9 flex justify-center"
                style={{ "--sa-delay": "60ms" } as React.CSSProperties}
            >
                <Wordmark style={{ fontSize: "1.75rem" }} />
            </div>

            <Card className="sa-panel mx-auto w-full max-w-md">
                <CardContent className="p-6">
                    <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                            <h1 className="font-display text-xl font-semibold">
                                Your apps
                            </h1>
                            <p className="text-muted-foreground mt-0.5 text-sm">
                                {isPending
                                    ? "Loading your account…"
                                    : session?.user.email
                                      ? `Signed in as ${session.user.email}`
                                      : "Pick where to go next."}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="sa-press shrink-0"
                            onClick={() => authClient.signOut()}
                        >
                            Sign out
                        </Button>
                    </div>

                    {error && (
                        <p
                            role="alert"
                            className="sa-alert border-destructive/40 bg-destructive/10 text-destructive-foreground mb-4 rounded-md border px-3 py-2 text-sm"
                        >
                            {error.message}
                        </p>
                    )}

                    <ul className="grid gap-1">
                        {apps.map((app, index) => (
                            <li
                                key={app.name}
                                className="sa-rise"
                                style={
                                    {
                                        "--sa-delay": `${240 + index * STAGGER_MS}ms`,
                                    } as React.CSSProperties
                                }
                            >
                                <Link
                                    href={
                                        isProduction ? app.prodUrl : app.devUrl
                                    }
                                    className="hover:bg-accent focus-visible:ring-ring group flex items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2"
                                >
                                    <span>
                                        <span className="block text-sm font-medium">
                                            {app.name}
                                        </span>
                                        <span className="text-muted-foreground block text-xs">
                                            {app.blurb}
                                        </span>
                                    </span>
                                    {/* Slides on hover — a small directional
                                        cue that the link leaves this app. */}
                                    <span
                                        aria-hidden
                                        className="text-muted-foreground group-hover:text-foreground translate-x-0 transition-all duration-200 group-hover:translate-x-0.5"
                                    >
                                        →
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
