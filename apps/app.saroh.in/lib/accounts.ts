// Client/Edge-safe accounts URLs — no server-only imports, so this can be
// imported from client components and Edge middleware. The server-only
// requireSession() lives in lib/session.ts.
export const accountsUrl =
    process.env.NEXT_PUBLIC_ACCOUNTS_URL ?? "https://accounts.saroh.in";

export const accountsLoginUrl = `${accountsUrl}/login`;
