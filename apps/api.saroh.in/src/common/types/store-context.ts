/**
 * Shape attached to `request.user` by BetterAuthGuard — the Better Auth
 * session user. `role`/`permissions` arrive with the M2 admin/organization
 * plugins; they are absent on the M1 core user.
 */
export interface AuthUser {
    id: string;
    email: string;
    name?: string | null;
    emailVerified: boolean;
    image?: string | null;
    role?: string;
    permissions?: string[];
}
