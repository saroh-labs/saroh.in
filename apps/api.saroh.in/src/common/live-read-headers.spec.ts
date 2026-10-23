import { liveReadCacheControl } from "./live-read-headers";

describe("liveReadCacheControl (review #4)", () => {
    it("lets a shared cache keep an answer only for what is left of the API's window", () => {
        expect(liveReadCacheControl(30)).toBe("public, max-age=0, s-maxage=30");
        expect(liveReadCacheControl(4)).toBe("public, max-age=0, s-maxage=4");
    });

    it("leaves the route's no-store when nothing is left", () => {
        expect(liveReadCacheControl(0)).toBeNull();
    });
});
