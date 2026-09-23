import { headers } from "next/headers";

/**
 * The instance's other apps, for the console's apps menu. Server-only.
 *
 * Addresses are worked out from the console's own host rather than written
 * in: every app on an instance is its hostname's first label on one shared
 * domain (DEC-002), so `admin.saroh.in` has its workspace at `app.saroh.in`
 * and a self-hosted `admin.saroh.example.com` at `app.saroh.example.com`.
 * Nothing here assumes the instance is Saroh's own (plan R20).
 */

export interface SiblingApp {
    key: string;
    name: string;
    description: string;
    href: string;
}

export interface InstanceApps {
    /** The instance's shared domain, e.g. `saroh.in`. */
    domain: string;
    apps: SiblingApp[];
}

export async function instanceApps(): Promise<InstanceApps | null> {
    // The forwarded host first: behind the local proxy (portless) or a load
    // balancer, `host` is the internal address, not the one the operator used.
    const list = await headers();
    const host = (list.get("x-forwarded-host") ?? list.get("host"))
        ?.split(",")[0]
        ?.trim()
        .split(":")[0];
    if (!host) return null;
    const [first, ...rest] = host.split(".");
    // Only a host shaped like `admin.<domain>` tells us where the others are.
    if (first !== "admin" || rest.length < 2) return null;
    const domain = rest.join(".");
    const at = (label: string, path = "") =>
        `https://${label}.${domain}${path}`;

    return {
        domain,
        apps: [
            {
                key: "app",
                name: "Workspace",
                description:
                    "Where businesses run: sales, bookings, customers, sites.",
                href: at("app"),
            },
            {
                key: "accounts",
                name: "Your account",
                description: "Your sign-in, profile and security.",
                href: at("accounts", "/account"),
            },
            {
                key: "help",
                name: "Help centre",
                description: "What merchants read when they are stuck.",
                href: at("help"),
            },
            {
                key: "docs",
                name: "Docs",
                description: "Guides and the API reference.",
                href: at("docs"),
            },
            {
                key: "website",
                name: "Website",
                description: "The public site for this instance.",
                href: `https://${domain}`,
            },
        ],
    };
}
