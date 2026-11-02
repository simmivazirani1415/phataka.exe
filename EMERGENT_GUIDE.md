# Phataka Party: rebuild guide for Emergent

Phataka Party is a Diwali web game. You collect eight crackers at the Pataka Store, pick one of five places in a 3D mohalla, and light each cracker with a webcam hand gesture. Every burst becomes a Polaroid in a 9-page scrapbook you can write in, share or download.

The live version is at https://simmivazirani1415.github.io/phataka.exe/street/

## What's in this package

| File | What it is |
|---|---|
| `phataka-party-source.zip` | The complete source: code, art, sounds, video, MediaPipe hand model and build tools. It does not include `node_modules`. |
| `phataka-party-site.zip` | The finished, built website. Upload this folder to any static host and it runs as is. |
| `EMERGENT_GUIDE.md` | This guide. A copy is also at the root of the source zip. |

The code is also on GitHub: `simmivazirani1415/phataka.exe`, branch `claude/project-thread-stxrxn`.

## Stack

- React 19 + TypeScript + Vite 8. It is frontend only, with no backend, database or login.
- three.js through React Three Fiber, Drei and postprocessing (bloom on High graphics).
- Zustand for state, GSAP for the intro, Web Audio for sound, jsPDF for scrapbook PDFs.
- MediaPipe Tasks Vision for hand tracking. The model and wasm are self-hosted in `public/mediapipe/`, so no CDN is needed.
- Progress is saved in the browser: settings in localStorage; Polaroids, notes and photos in IndexedDB.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # outputs dist/ with a relative base, so it can be hosted under any path
```

Useful URL flags: `?fresh` starts a new game, `?skipintro` skips the door film, and `?debug` exposes `window.__pataka` for testing.

## Two ways to bring it into Emergent

**A. Keep this exact app (recommended).** Start a new Emergent project and upload `phataka-party-source.zip`, or point Emergent at the GitHub repo and branch above. Then paste the prompt below. This keeps every asset, gesture and animation exactly as it is now.

**B. Host only the finished site.** Unzip `phataka-party-site.zip` and serve the folder as static files. Nothing needs building.

The webcam only works over **HTTPS** (or on localhost). Emergent's preview and deploy URLs are HTTPS, so gestures will work there.

### Prompt to paste into Emergent

```
This project is an existing, finished React + TypeScript + Vite web game called Phataka Party (uploaded as a zip /
connected from GitHub). Do NOT rewrite it or convert it to another framework, and do not add a backend, database or
login: it is frontend-only and saves progress in the browser (localStorage + IndexedDB).

Please:
1. Install dependencies with `npm install` and run it with `npm run dev` (Vite, port 5173). Serve it as a static
   frontend; if your template expects a frontend folder, place this project there unchanged.
2. Keep everything in public/ as it is: public/assets (art, sounds, the intro video, place icons, people and
   vehicles) and public/mediapipe (the hand-tracking model and wasm, which are self-hosted on purpose).
   `npm run dev` and `npm run build` run tools/copy-mediapipe.mjs first, which copies the MediaPipe wasm out of
   node_modules; keep that step.
3. Build with `npm run build` and deploy the dist/ folder over HTTPS (the webcam needs HTTPS). vite.config.ts uses
   base './', so it works at any URL path.
4. Hand-gesture lighting is the core of the product: keep it working everywhere. Test with the camera on:
   bomb = pinch then let go; rocket = fist bursts open; chakri = draw a circle with one finger; phuljhadi = hold
   and twirl your hand in circles; anaar = two-hand triangle; ladi = open palm swipe; 7 shot = palm rises;
   pop-pop = throw it like a ball.
5. Check the phone layout at 390x844 (stash dock at the bottom, place dropdown above it, scrapbook top right) and
   desktop at 1440x900.
```

## Where things live (`src/`)

| Folder / file | What it does |
|---|---|
| `App.tsx`, `main.tsx` | App shell, overlays, fonts and styles. |
| `intro/` | The landing: door film, blurred welcome, gold logo, three steps, "Enter the Mohalla". |
| `street/` | The 3D mohalla: `StreetLayout.ts` (the five places, buildings and collision), `StreetCamera.tsx`, `Crowd.tsx` (people and their reactions and voice lines), `Traffic.tsx` (vehicles and the parked-car alarm), `Locations.ts` (travel between places). |
| `street/ui/` | `StoreShelf.tsx` (Pataka Store), `InventoryTray.tsx` (stash), `LocationMap.tsx` (place picker and phone dropdown), `PlaceChoice.tsx` ("Where should it go?" on Balcony and Society), `SpotlightCard.tsx` + `GestureDemo.tsx` (gesture guide), `BurstMarker.tsx` ("Burst it!" fallback). |
| `game/` | `GameState.ts` (Zustand store and saves), `DiscoverySystem.ts` (collect, place, light), `FireworkSystem.tsx` (every cracker's effect, including the handheld phuljhadi), `ParticlePool.tsx`, `MemorySystem.ts`. |
| `input/` | `HandTracker.ts` (camera + MediaPipe), `handFeatures.ts`, `gestures.ts` (one detector per cracker). |
| `scrapbook/` | The 9-page book, notes and photos (`notes.ts`, IndexedDB), canvas page renderer, PDF/zip/share exports and the send sheet. |
| `utils/` | Polaroid renderer, screenshot capture, performance monitor, `useNarrow` (phone breakpoint). |
| `styles/` | `party.css` (main look), `book.css` (scrapbook), `mobile.css` (phone layout, loaded last). |
| `assets/AssetRegistry.ts` | The eight crackers: names, relatives, copy, packaging art and colours. |

## Design system

- Colours: plum `#4a1230` to `#741f49`, gold `#f3b83e` / `#f6b53a`, ivory `#fff1d7`.
- Fonts: Rozha One for titles, DM Sans for UI, Kalam for handwriting (all bundled through @fontsource).
- Keep the UI minimal: no extra panels or instructions beyond what is there.

## Known notes

- Phones start on Low graphics. High adds bloom and more lights.
- The voice lines ("Arre baap re!", "Kya yaar!"…) use the browser's built-in speech voice, so they sound robotic and aren't truly spatial. Recorded clips would sound better.
- There are no pets in the mohalla, by design.
