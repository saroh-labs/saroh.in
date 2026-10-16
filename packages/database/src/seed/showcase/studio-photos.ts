import { fvPhoto } from "./frame-vow-posts";
import { pcPhoto } from "./pixel-chai-posts";
import type { StudioImage } from "./studio-types";

/**
 * The photographs the two studios' sites and catalogues use, by role. Each
 * is one of the free-licence Unsplash photographs their writing already
 * uses (the tables in `frame-vow-posts.ts` and `pixel-chai-posts.ts`), every
 * one looked at before it was chosen, hot-linked and credited, and checked
 * by `scripts/check-demo-images.mjs`. Where no photograph honestly shows a
 * thing — album covers, a canvas on a wall, a standee — the picture is drawn
 * (`studio-art.ts`).
 */

export const FV_PHOTOS = {
    heroMandap: fvPhoto("palaceMandap"),
    studioCamera: fvPhoto("photographerFront"),
    wedding1a: fvPhoto("lakePalaceWhite"),
    wedding1b: fvPhoto("picholaBoat"),
    wedding1c: fvPhoto("mandapOutdoor"),
    wedding2a: fvPhoto("hawaMahalHorses"),
    wedding2b: fvPhoto("amerRamp"),
    wedding2c: fvPhoto("jaipurCityPalace"),
    wedding3a: fvPhoto("ritualThali"),
    wedding3b: fvPhoto("kalashPour"),
    wedding3c: fvPhoto("archWindowLake"),
    wedding4a: fvPhoto("coupleForest"),
    wedding4b: fvPhoto("groomCarries"),
    wedding5a: fvPhoto("coupleEmbrace"),
    wedding5b: fvPhoto("handsRed"),
    wedding5c: fvPhoto("chhatriLake"),
    wedding6a: fvPhoto("coupleRiver"),
    wedding6b: fvPhoto("handsDark"),
    wedding7a: fvPhoto("coupleRuins"),
    wedding7b: fvPhoto("coupleArchSmoke"),
    wedding8a: fvPhoto("brideSmile"),
    wedding8b: fvPhoto("coupleLights"),
    haldi: fvPhoto("haldiShower"),
    mehendi: fvPhoto("mehendiBridal"),
    albumOpen: fvPhoto("albumOpen"),
    albumStack: fvPhoto("albumBw"),
    fineArtPrint: fvPhoto("brideBw"),
    decorMandap: fvPhoto("banquetMandap"),
    decorHaldi: fvPhoto("haldiCanopy"),
    decorSangeet: fvPhoto("stageSofas"),
    cateringThali: fvPhoto("thaliTop"),
    cateringBuffet: fvPhoto("foodSpread"),
    djNight: fvPhoto("djDeck"),
    mehendiArtist: fvPhoto("mehendiArtist"),
    udaipurLake: fvPhoto("picholaAerial"),
    jaipurCity: fvPhoto("jalMahal"),
} as const satisfies Record<string, StudioImage>;

export const PC_PHOTOS = {
    heroWorkspace: pcPhoto("phoneShoot", "Two hands holding a phone up to frame a shot of a room"),
    designDesk: pcPhoto("laptopMug", "A laptop on a desk with a coffee mug in warm evening light"),
    printPack: pcPhoto("notebookBlank", "A blank spiral notebook and a pen on a wooden table"),
    standee: pcPhoto("cafeEvening", "A warmly lit café counter with hanging pendant lights"),
    tableTent: pcPhoto("cafeWindow", "An empty café with round tables beside tall windows"),
    cafe: pcPhoto("kulhadRows", "Rows of clay kulhad cups filled with chai"),
    salon: pcPhoto("salonChairs", "Three salon chairs facing a long mirror in a bright room"),
    dental: pcPhoto("dentalRoom", "A bright dental clinic room with a chair and cabinets"),
    sweets: pcPhoto("katli", "Kaju katli and cashews on a tray with red cloth behind"),
    gym: pcPhoto("gymHall", "A large gym with benches and racks under skylights"),
    coaching: pcPhoto("workshop", "A small group seated in a room listening to a speaker beside a screen"),
    restaurant: pcPhoto("thaliTop", "Two thalis from above with many small bowls"),
    handloom: pcPhoto("handloom", "Folded handloom fabric with woven motifs and a striped border"),
    indore: pcPhoto("chhatri", "Old stone chhatris in a green garden in Indore"),
} as const satisfies Record<string, StudioImage>;
