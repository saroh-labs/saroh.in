import { getBookImage } from "@/lib/share-item/book-image-server";

/**
 * The booking page's card for the Share sheet (#1375): a proxy, so the
 * session is attached server-side and the business is the active one. The
 * headline someone typed stays between them and the API: nothing caches it.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const res = await getBookImage(new URL(request.url).searchParams);
    if (!res?.ok || !res.body) {
        return new Response(null, {
            status: res ? (res.ok ? 502 : res.status) : 404,
            headers: { "cache-control": "no-store" },
        });
    }
    return new Response(res.body, {
        headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
}
