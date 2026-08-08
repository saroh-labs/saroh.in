import { PageHeader } from "@saroh/ui/page-header";
import { Blocks, Building2, Plug, UserCog } from "lucide-react";
import Link from "next/link";

import { accountsUrl } from "@/lib/accounts";
import { requireSession } from "@/lib/session";

/**
 * Settings landing page. `/settings/*` pages existed with nothing at the root,
 * so the nav group had no index to point at and the area was only reachable by
 * typing a full path.
 *
 * It also names the split deliberately: organization/workspace configuration
 * lives here, but ACCOUNT settings belong to accounts.saroh.in — the single
 * identity provider — so this links out rather than duplicating identity UI.
 */
export const metadata = { title: "Settings" };

const SECTIONS = [
    {
        href: "/settings/organization",
        label: "Organization",
        description:
            "Workspace name and the business identity used across Saroh.",
        icon: Building2,
    },
    {
        href: "/settings/modules",
        label: "Modules",
        description: "Turn the capabilities your business needs on or off.",
        icon: Blocks,
    },
    {
        href: "/settings/providers",
        label: "Providers & health",
        description:
            "The external services your modules depend on, and whether each is ready.",
        icon: Plug,
    },
];

export default async function SettingsPage() {
    await requireSession();

    return (
        <main className="mx-auto max-w-3xl p-8">
            <PageHeader
                title="Settings"
                description="Configure this organization. Your personal sign-in details live in your Saroh account."
            />
            <div className="grid gap-3">
                {SECTIONS.map(({ href, label, description, icon: Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className="flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
                    >
                        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                        <span className="grid gap-1">
                            <span className="font-medium">{label}</span>
                            <span className="text-sm text-muted-foreground">
                                {description}
                            </span>
                        </span>
                    </Link>
                ))}

                {/* Cross-origin on purpose: identity is owned by accounts. */}
                <a
                    href={`${accountsUrl}/account`}
                    className="flex items-start gap-3 rounded-lg border border-dashed p-4 transition-colors hover:bg-accent"
                >
                    <UserCog className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <span className="grid gap-1">
                        <span className="font-medium">
                            Your account
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                                accounts.saroh.in
                            </span>
                        </span>
                        <span className="text-sm text-muted-foreground">
                            Name, email, password, active sessions, and account
                            deletion.
                        </span>
                    </span>
                </a>
            </div>
        </main>
    );
}
