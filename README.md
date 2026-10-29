# Pataka.exe

*Har ghar mein ek pataka hai.* A miniature Diwali mohalla that builds itself out of tiny blocks. You find eight hidden pataka boxes, light their (completely virtual) crackers, and keep the moments as Polaroids in a scrapbook you can download.

React + TypeScript + Vite, three.js through React Three Fiber and Drei, GSAP, Zustand, Web Audio, and jsPDF with Canvas. There is no backend and no login. Progress lives in the browser: settings and metadata in localStorage, photos in IndexedDB.

```bash
npm install
npm run dev      # http://localhost:5173  (add ?debug to expose window.__pataka for tests)
npm run build    # tsc -b && vite build → dist/ (relative base, can be hosted under any path)
```

## Street-level mohalla (v3)

The diorama is now the backdrop of the intro film only. When the TILLI. doors open you are standing in the gali at eye height (1.6 m), and the rest of the game is played on foot.

- **Walking.** WASD or arrows to walk, Shift to run, drag to look. On phones a joystick sits bottom left (add `?joystick` to force it). Walls, stalls, people and vehicles block you.
- **The mohalla.** It is built from 36 m chunks: the chowk (main bursting ground), the chai stall, the temple corner, a house lane, a shop lane and side galis, with balconies, rooftops, signs, rangolis, buntings and fairy lights. Chunks are streamed and reused as you walk, so the gali never ends. Code is in `src/street/` (`StreetLayout.ts` holds the layout, collision and placement rules).
- **Packets.** The eight boxes are larger, with a pulsing golden glow, sparkles and a ground pool that brighten as you get closer. Walk up and press E (or tap Pick up).
- **Tray.** All eight crackers sit in a slim tray on the right from the start, as small renders of the real cracker. Tapping a new one shows its collectible card (the box art). Collecting it adds it with x5 lights and puts it in your hand. Drag it (or tap the ground) to put it down. The reticle is gold on open ground, red near walls, people, vehicles and animals. An empty cracker refills with a tap. The boxes are still hidden in the gali for anyone who likes hunting.
- **Places to burst from.** The map (top left) jumps between the Gali by the chai stall, the Chowk, the family terrace (Chhat) above the chowk and a long first-floor Balcony next to it. You can walk and place crackers on each floor, and the crowd below still reacts.
- **Lighting.** The camera drops into a low spotlight on the cracker. The card at the bottom plays a looping animation of that cracker's hand gesture, has one button (Light with your hand) that turns the camera on, and a ring that fills as the gesture is done. Tapping the ring lights the cracker too. Bursts happen on the ground with sparks, smoke, a scorch mark that fades, light on nearby walls and sound. The bomb shakes the camera and the rocket launches from where it stands. The first burst of each cracker becomes its Polaroid.
- **People and traffic.** The people and vehicles are Simran's illustrations (`public/assets/people`, `public/assets/vehicles`, registered in `AssetRegistry.ts` as the street cast and cleaned with `tools/prepare_cast.py`), drawn as upright cut-outs with a walking bob, hops and flinches. Vehicles stay side-on to the road. The nearest vehicle honks at every burst. An instanced crowd walks, chats, sits at the chai stall and watches from balconies. Scooters, bicycles, autos and cars drive on the left, follow each other and stop for you. Bursts make people flinch, cover their ears or step back, kids cheer, someone films, dogs run off and riders brake and swerve, with the odd Hinglish line. Crackers can only be placed clear of everyone, and people keep away from a lit cracker, so nobody is ever hit.
- **Performance.** Buildings, people and vehicles are InstancedMeshes that share buffers between chunk copies, with distance LOD for detail, lights and crowd animation, pooled particles and pooled ground marks. Low Graphics shortens the draw distance, halves the lamp lights and skips bloom. Reduced motion turns off head bob and camera shake.
- **Saves** use their own keys (`pataka.exe.street.v1`), so this build can live next to the older one on the same site.

## What's in it, by stage (v1)

1. **World and intro.** The mohalla is procedural: about 3,000 blocks, instanced by material and shape. It has six zones: the gali, the pataka shop, the courtyard, rooftops, the family terrace and the chai corner. The intro shows a ghost silhouette, then the blocks assemble in phases: ground, road, walls, details, props, lights. The intro can be skipped, and it runs 3× faster in reduced motion.
2. **Camera.** A 360° orthographic orbit with polar and zoom limits and inertia. Presets: Overview, Terrace, Street, Shop, Courtyard and Rooftops. R or the reset button returns to the start view. The base zoom adapts to the viewport.
3. **Packages.** The eight designs from `public/assets/pataka-packaging/` (with `asset_manifest.json`) become physical cardboard boxes. Each box has its own proportions, wall thickness, printed side panels and back panel, and a hinged lid. `tools/rectify_fronts.py` flattens each front illustration from the 3D render. Anaar's box is tapered with a trapezoid UV.
   - Each box is hidden at an anchor in the world, with a glint and a hint beacon.
   - It moves through HIDDEN → DISCOVERED → OPENING → UNLOCKED → PLAYED → MEMORY_CAPTURED.
   - On discovery the box rises, turns to face you and opens, and the cracker hops out.
4. **Fireworks and progression.** There are eight distinct virtual effects: bomb, rocket, chakri, phuljhadi, anaar, ladi, snake and pop-pops. They use a pooled particle system and a shared light. Each one you find lights up more of the mohalla over stages 1–8: the decorated balcony, the shop sign, distant sky bursts, lanterns, courtyard diyas and zigzag lights.
5. **Characters, interactions and audio.** There are 19 voxel residents with idle, talk, wave, look, walk and react animations. The nearest one says a line for each event. You can click diyas, light strings, the scooter horn, the chai kettle, the child and the dog. All audio is procedural, and it starts muted.
6. **Memories.**
   - Each first lighting captures a real rendered frame as a Polaroid, with the package illustration as a stamp. Nothing is faked: if a photo is missing, the memory is dropped.
   - The album holds a cover, a world photo, the collection, the Polaroids and a closing page.
   - You can download the A5 PDF `pataka-exe-my-diwali-memories.pdf`, save a PNG, or share through Web Share where the browser supports it.
7. **Settings and robustness.** Settings cover graphics (High/Low), reduced motion, flash intensity, hints, quick reveal, and Reset Experience. There are touch targets of at least 44 px, a mobile HUD, a WebGL fallback screen, an error boundary, and adaptive DPR with a Low Graphics suggestion when frames drop.

No prices, checkout or shopping anywhere, and no real-world handling instructions.

## Look and controls (v2)

- **High graphics** adds a post-processing pass: HDR bloom, so diyas, windows, light strings and sparks glow, plus ACES tone mapping, a little extra saturation and a soft vignette. Polaroids render through the same pass, so photos match the screen. Low graphics skips it.
- A **360° view dock** at the bottom of the screen turns the mohalla in 45° steps or jumps to Overview, Street, Pataka Shop, Courtyard, Rooftops or Main Terrace.

### Credits

- Bloom and grading use [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) and [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) (both MIT).
- The setup follows [deadronos/voxel-celebration](https://github.com/deadronos/voxel-celebration) (MIT), an R3F voxel festival scene. No code or assets were copied from it.

## Tested

- All eight packages played end to end (present → open → light → Polaroid) in headless Chromium at 960×600.
- A full run at a 390×844 phone viewport with reduced motion, including the album and a generated 5-page A5 PDF.
- A production build served from a sub-path, with all packaging assets loading.

## Known limitations

- The testing used a software GPU only, so performance on real phones has not been measured. Low Graphics is the fallback.
- Some effects read small from their effect camera, mainly the ladi cracker model, which can hide behind its box.
- Sound design is procedural and simple. There are no recorded samples.
- Web Share with files works only where the browser supports it. Otherwise the PNG downloads and the share text is copied.
