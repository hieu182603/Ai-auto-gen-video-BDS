# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` first — its rules (accuracy of property data, no invented imagery/distances, keys out of props, no web/cloud unless asked) apply here too. `README.md` (Vietnamese) documents every CLI command and input field; `docs/PROJECT.md` records scope decisions and known limitations.

## Commands

On Windows PowerShell use `npm.cmd`, not `npm` (npm.ps1 strips flags like `--input`/`--draft`). Node 22+.

```powershell
npm.cmd run check                      # typecheck + tests
npm.cmd run typecheck
npm.cmd test                           # tsx --test tests/*.test.ts
npx.cmd tsx --test --test-name-pattern "timeline" tests/pipeline.test.ts   # single test
npm.cmd run video -- render --input examples/ho-tay.json --draft --seconds 12  # smoke render
npm.cmd run video -- validate --input examples/ho-tay.json
npm.cmd run video -- doctor
npm.cmd run studio                     # Remotion Studio (preview only, not a product UI)
```

Other entry points: `video -- prepare|still|batch|tts|scan-amenities|fetch-boundary|fetch-route|osm-sync|osm-query`, plus `npm run auto`, `script:ai` (Gemini), `amenities`, `generate-model`. All scripts load `.env` if present.

## Architecture

Pipeline: property JSON → Zod validation (`src/schema.ts`) → timeline, narration, SRT (`src/timeline.ts`) → Remotion bundle → Chromium + Three.js → H.264 MP4.

- `scripts/` is the Node side (CLI, file prep, network calls). `scripts/cli.ts` dispatches subcommands; `scripts/project.ts` prepares job dirs, validates/syncs media (`assets/models/` → `public/models/`) and provides `runPool`, the bounded worker pool used by `batch`; `scripts/render.ts` bundles, renders posters and MP4, writes `status.json`.
- `src/` is the Remotion bundle (browser side). `src/Root.tsx` registers two compositions, `PropertyVideo` and `PropertyPoster`. `src/Video.tsx` lays out the 5 scenes; `House.tsx`/`Map3DScene.tsx`/`Boundary3D.tsx`/`Panorama.tsx`/`BeforeAfterWipe.tsx` are scene pieces; `src/tts/` holds TTS provider clients (CIT Voice Studio local, Edge TTS, Gemini).
- Network-touching features (TTS, OSM Overpass/Nominatim, OSRM, Gemini script) run only in explicit commands and write results back into JSON/`out/`; `render` itself is offline.
- Each job writes to its own `out/<id>-<format>-<job>/` (video, posters, input/timeline JSON, captions, narration, status) and never overwrites earlier runs. `tts` emits a new `out/tts-<id>-<job>/input.json` to render from.
- Media paths in input JSON are relative to `public/` (path traversal is rejected by the schema).
- `skills/map-bds-video/SKILL.md` is the agent skill that drives this CLI.

## Invariants (enforced by tests)

- Timeline must cover every frame exactly once for all supported durations (12–120 s) and fps (24/30).
- Animation derives purely from Remotion frame numbers so parallel renders are deterministic — no wall clock, no accumulated `useFrame` state.
- All Remotion packages pinned to the same exact version; commit `package-lock.json` with dependency changes.
