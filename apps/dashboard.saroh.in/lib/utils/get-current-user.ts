import { auth } from "../auth";

export async function getCurrentUser() {
    const session = await auth();
    const user = session?.user;
    if (user) return user;
    return null;
}
