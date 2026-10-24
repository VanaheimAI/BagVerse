# BagVerse RWA Vault notes
## First real asset (Oct 19)
- **Asset:** Collector Crypt `inuRTqXX15NQAS48xZaHgFT4tCV4kdwrHisUhBkTZdD` (Solana): 2025 One Piece OP13 *Carrying on His Will* #118 Monkey D. Luffy, PSA 10.
- **Data:** `src/rwa.js` holds the `RWA_ASSETS` list (mint, set, grade, issuer URL, image URL, unlock level). Add more vault items there.
- **3D slab:** the "graded card" hologram (HOLO #2) is now a clear clearcoat slab. The insert is canvas-drawn: a grading label (year, set, number, name, issuer, short mint, PSA 10) above the card photo, on both faces.
  - Photo sources, tried in order: `public/assets/rwa/<mint>.jpg` (optional local copy), then Collector Crypt's CloudFront URL.
  - If the image can't be used as a WebGL texture (CORS/CSP taints the canvas), the slab keeps a text-only face.
- **Hologram label:** "LUFFY · PSA 10" with the tournament countdown.
- **Vault modal (E):** a featured card with the photo (plain `<img>`, removed on error), set, grade, short mint, unlock level and a "View on Collector Crypt" link. Gold watch and gold bar remain demo items.
- **CDN/CORS:** no longer matters for this card, because the photo is bundled (see below).
- **Status:** display only. Escrow comes with the blockchain phase.

## Slab photo bundled (Oct 19)
- The owner supplied a photo of the PSA slab. It is cropped to 332×550 and saved as `src/assets/rwa/<mint>.jpg`. Vite in this project ignores `?inline`, so it is inlined as a data URL in `src/assets/rwa/<mint>.js` (about 106 KB of the JS bundle). It now loads on any host, with no CORS dependency.
- When `photo` is set, the 3D slab shows the photo full-bleed (the real PSA label included) at the photo's aspect ratio (1.12 m tall before the 1.4× item scale). The drawn label and CDN image are used only for assets without a photo.
- **Label details** (read from the photo, not checked against PSA's database): Alternate Art, cert 146575703. The vault modal shows both.
- The cyan holo beam under the card is shortened (scale 0.52), so it stops below the slab and no longer washes out the lower half of the card.
- **Adding another vault card:** add an entry to `RWA_ASSETS`. Photos go in `src/assets/rwa/`; regenerate the `.js` data-URL module with base64.
