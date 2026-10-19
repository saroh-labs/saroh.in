import { getJson } from "./control-plane";
import type { ConsoleHome } from "./home-words";

/**
 * Home's read (admin console redesign U10): `GET /admin/home`, counts and
 * dates only. `null` when this person may not read Saroh's counts
 * (`platform:read`, which every role but the Account manager holds).
 * Server-only.
 */
export function getHome(): Promise<ConsoleHome | null> {
    return getJson<ConsoleHome>("/home");
}
