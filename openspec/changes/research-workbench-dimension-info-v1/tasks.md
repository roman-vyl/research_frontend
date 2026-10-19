## 1. research_frontend

- [ ] 1.1 `src/api/experiments.ts`: `DimensionInfo` type, `ExperimentDimension.info?`; shape check (D1).
- [ ] 1.2 `DimensionInfo` popup component and "i" button in `SurfaceControls` for optional and always-on controls (D2); styles in `surface.css`.
- [ ] 1.3 `scripts/vote-info-to-manifest-info.mjs`: converter `vote_info.json` → `info` blocks (D3).
- [ ] 1.4 Tests: button only with valid info; popup content; row details toggle; close on Esc / outside / button; one popup at a time; view and session unchanged; switched-off optional dimension stays off; converter rows for BTC A1, a veto-only voter, a voter without veto, frozen v3 title.
- [ ] 1.5 `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, all unit tests, `openspec validate --all --strict`.

## 2. Data (Mac, only on the owner's word)

- [ ] 2.1 Back up the four vote manifests, write the converter's blocks into `vote_threshold` and `own_vote_threshold`, check the manifest API returns them; result rows untouched.
- [ ] 2.2 Owner check on the Mac front.
