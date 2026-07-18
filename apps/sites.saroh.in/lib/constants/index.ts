import { env } from "@/env";

export const HOME_HOSTNAMES = new Set([
    "saroh.in",
    "home.localhost:3000",
    "localhost",
]);

export const isHomeHostname = (domain: string) => {
    return HOME_HOSTNAMES.has(domain) || domain.endsWith(".vercel.app");
};

export const HOME_DOMAIN =
    env.NEXT_PUBLIC_VERCEL_ENV === "production"
        ? "https://saroh.in"
        : env.NEXT_PUBLIC_VERCEL_ENV === "preview"
          ? // ? `https://${env.NEXT_PUBLIC_VERCEL_URL}`
            "https://saroh.in"
          : "http://home.localhost:8888";

export const APP_HOSTNAMES = new Set([
    "app.saroh.in",
    "preview.saroh.in",
    "localhost:8888",
    "localhost",
]);

export const APP_DOMAIN =
    env.NEXT_PUBLIC_VERCEL_ENV === "production"
        ? "https://app.saroh.in"
        : env.NEXT_PUBLIC_VERCEL_ENV === "preview"
          ? // ? "https://preview.saroh.in"
            "https://app.saroh.in"
          : "http://localhost:8888";

export const APP_DOMAIN_WITH_NGROK =
    env.NEXT_PUBLIC_VERCEL_ENV === "production"
        ? "https://app.saroh.in"
        : env.NEXT_PUBLIC_VERCEL_ENV === "preview"
          ? "https://preview.saroh.in"
          : env.NGROK_URL;

export const API_HOSTNAMES = new Set(["api.saroh.in", "api.localhost:8888"]);

export const ADMIN_HOSTNAMES = new Set([
    "admin.saroh.in",
    "admin.localhost:8888",
]);

export const DEFAULT_REDIRECTS = {
    home: "https://saroh.in",
    saroh: "https://saroh.in",
    signin: "https://app.saroh.in/login",
    login: "https://app.saroh.in/login",
    register: "https://app.saroh.in/register",
    signup: "https://app.saroh.in/register",
    app: "https://app.saroh.in",
    dashboard: "https://app.saroh.in",
    links: "https://app.saroh.in/links",
    settings: "https://app.saroh.in/settings",
    welcome: "https://app.saroh.in/welcome",
    discord: "https://discord.com/sarohdotio", // placeholder for now
    tags: "https://saroh.in/help/how-to-use-tags",
};

export const SHOW_BACKGROUND_SEGMENTS = new Set([
    "tools",
    "pricing",
    "help",
    "customers",
    "blog",
    "(blog-post)",
    "login",
    "register",
    "auth",
]);

export const SAROH_HEADERS = {
    headers: {
        "x-powered-by": "Saroh.io - Storefront creator",
    },
};
