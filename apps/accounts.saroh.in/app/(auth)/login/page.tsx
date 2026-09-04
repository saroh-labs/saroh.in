import { LoginForm } from "@/components/auth/login-form";
import { safeReturnTo } from "@/lib/return-to";

/**
 * A server component so the `?redirect=` check runs on the server (#222).
 *
 * `isTrustedOrigin` reads `BETTER_AUTH_TRUSTED_ORIGINS`, which the browser
 * never sees — validating in the client component would silently fall back to
 * the production list and reject every development origin. The form receives
 * a destination that has already been vetted, so it cannot follow an
 * unvetted one.
 */
export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { redirect } = await searchParams;
    return <LoginForm returnTo={safeReturnTo(redirect)} />;
}
