import { resolveServerSession } from "@saroh/auth/next";
import { Card, CardContent } from "@saroh/ui/card";
import { Wordmark } from "@saroh/ui/wordmark";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignOut } from "@/components/businesses/sign-out";
import { env } from "@/env";
import { getAppUrl } from "@/lib/app-urls";
import { isStaff } from "@/lib/businesses";

export const metadata: Metadata = {
    title: "Saroh's apps · Saroh",
    robots: { index: false, follow: false },
};

/** Saroh's own hosts, for the people who run it. */
const apps = [
    {
        name: "Application",
        blurb: "What a business runs on: orders, bookings, sites.",
        devUrl: "https://app.saroh.localhost",
        prodUrl: "https://app.saroh.in",
    },
    {
        name: "Admin",
        blurb: "The console for this instance.",
        devUrl: "https://admin.saroh.localhost",
        prodUrl: "https://admin.saroh.in",
    },
    {
        name: "Sites",
        blurb: "Published business websites.",
        devUrl: "https://saroh.app.localhost",
        prodUrl: "https://saroh.app",
    },
    {
        name: "Templates",
        blurb: "Website templates.",
        devUrl: "https://templates.saroh.localhost/ecommerce",
        prodUrl: "https://templates.saroh.in",
    },
    {
        name: "Docs",
        blurb: "Guides and API reference.",
        devUrl: "https://docs.saroh.localhost",
        prodUrl: "https://docs.saroh.in",
    },
    {
        name: "UI",
        blurb: "The design system.",
        devUrl: "https://ui.saroh.localhost",
        prodUrl: "https://ui.saroh.in",
    },
    {
        name: "Website",
        blurb: "The marketing site.",
        devUrl: "https://saroh.localhost",
        prodUrl: "https://saroh.in",
    },
];

/**
 * A launcher for Saroh's own hosts, for Saroh staff only.
 *
 * This used to be where EVERY sign-in landed, so a shop owner signing in met
 * "Admin: Platform control plane" and "UI: The design system" before their
 * own business (UX audit, 10 Oct, severity 4). Signing in lands on Saroh
 * itself now (`lib/return-to.ts`), nothing links here, and anyone who is not
 * staff is sent on to it.
 *
 * Who is staff is the API's answer, never this app's: `isStaff` asks
 * `GET /admin/me`, which only a platform admin gets a 200 from. A refusal or
 * an outage both read as "not staff", so a failure here can only hide the
 * page, not show it.
 */
export default async function AppsListPage() {
    const result = await resolveServerSession(await headers());
    if (result.status === "anonymous") redirect("/login?redirect=/apps");
    if (result.status === "unavailable" || !(await isStaff())) {
        redirect(getAppUrl());
    }
    const { user } = result.session;
    const isProduction = env.NODE_ENV === "production";

    return (
        <div className="flex min-h-screen flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
            <div className="sa-rise mb-9 flex justify-center">
                <Wordmark style={{ fontSize: "1.75rem" }} />
            </div>

            <Card className="sa-panel mx-auto w-full max-w-md">
                <CardContent className="p-6">
                    <div className="mb-5 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h1 className="font-display text-xl font-semibold">
                                Saroh&apos;s apps
                            </h1>
                            <p className="text-muted-foreground mt-0.5 truncate text-sm">
                                Signed in as {user.email}
                            </p>
                        </div>
                        <SignOut />
                    </div>

                    <ul className="grid gap-1">
                        {apps.map((app) => (
                            <li key={app.name} className="sa-rise">
                                <a
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
                                    {/* A small directional cue that the link
                                        leaves this app. */}
                                    <span
                                        aria-hidden
                                        className="text-muted-foreground group-hover:text-foreground duration-fast transition-colors"
                                    >
                                        →
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
