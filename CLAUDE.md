# CLAUDE.md — aq-opn-simulator

## Project
Aquila Optical Power Network. Interactive 3D tool for designing and analysing laser power relay networks across Earth and cislunar space.

## Stack
Vanilla JS + Three.js r160 (ES modules via import map from cdn.jsdelivr.net). No build step. Static site.

## Run
```bash
python3 -m http.server 8080
# or
make serve
```

## Structure
Single-page app with two views sharing the same Three.js scene and simulation state:
- **Engineer view** — Full sidebar with node editor, link inspector, beam settings, time bar
- **Customer view** — Full-screen 3D with HUD overlay, one-click node deployment, revenue tracking

See js/ directory. Each file has a single responsibility. physics.js is pure functions (no DOM). UI files import from data/logic files, never the reverse.

## Coordinate System
Three.js Y-up. 1 scene unit = 1000 km. Earth radius = 6.371 units. North pole = +Y. Greenwich meridian = +Z.
Lat/lon to Cartesian: x = R*cos(lat)*sin(lon), y = R*sin(lat), z = R*cos(lat)*cos(lon).
Earth mesh is rotated -π/2 on Y so the texture aligns Greenwich to +Z.

## Conventions
- SI units internally (W, m, rad, km). Convert at UI boundary only.
- Constants in constants.js. Never hardcode physical values in other files.
- All node/link state lives in nodeManager.js and linkManager.js respectively. UI files read from these, never own state.
- physics.js must have zero imports from other project files (except constants.js). Keep it testable in isolation.
- British English for all prose and user-facing strings.

## Brand / Styling
Follows Aquila Brand Guidelines (`Aquila - Brand Guidelines.pdf` in repo root).
- **Font**: Heebo (Google Fonts) — Medium for headings, Regular for body. Loaded via `<link>` in both HTML files.
- **Primary accent**: #68EAD3 (brand aqua). Light variant: #C3F5EA.
- **Extended palette**: warm amber (#FFA94D) for power metrics, green (#66D9A0) for financial/revenue, pale aqua (#E1F9F1) for neutral values, sky blue (#68C4EA) for satellite/relay stats.
- **Backgrounds**: #0a0a0e (body), #131318 (panels), #252530 (borders).
- **CSS variables**: all theme colours defined as CSS custom properties in `:root` of both style.css and dashboard.css. Use variables, not hardcoded hex, in new CSS.
- **Stat values** use monospace font (SF Mono / Fira Code / Consolas) for numerical readability; labels use Heebo.
- Active link status colour is brand aqua (#68EAD3), not green.
- Brandmark SVG is dark (#0C0C0C); CSS `filter: invert(1)` makes it visible on dark theme.

## Key Modules
- `constants.js` — Scale factors, physical constants, node type registry (8 types incl. ORBITAL_CUSTOMER), beam types, zenith transmission table, turbulence constants, coordinate helpers
- `physics.js` — Pure link budget calculations (Gaussian beam model: θ=λ/πw₀ divergence, 1−exp(−2r²/w²) capture), atmospheric attenuation (zenith transmittance + H=2 km optical scale height), LOS
- `turbulenceModel.js` — HV-5/7 Cn² profile integration (station-altitude-aware), r₀/θ₀ with wavelength + elevation scaling, point-ahead angle, Noll 87/13 tilt/HO Strehl decomposition, effective spot size. Enabled by default with wind=21 m/s, Cn²=1.7e-14
- `tooltip.js` — Hover tooltip system with centralised TOOLTIPS registry; event delegation so dynamic elements work automatically
- `nodeManager.js` — Node CRUD, Three.js mesh creation, selection, dragging
- `linkManager.js` — Link CRUD, beam rendering with particles, status colour coding, per-frame visual position updates
- `linkBudget.js` — Wraps physics.js + turbulenceModel.js for per-link budget computation with node parameters; exposes turbulence fields (r₀, θ₀, point-ahead, Strehl ratios), overall link efficiency (P_rx/P_tx); status classification (ACTIVE/MARGINAL/BROKEN/INACTIVE)
- `orbitalMechanics.js` — Keplerian propagation with J2 (Newton-Raphson Kepler solver), ECI→scene coords, orbit trail rendering
- `timeController.js` — Play/pause/speed (up to 10000×), epoch display, per-frame orbital propagation with throttled link recompute
- `uptimeTracker.js` — Per-node power uptime percentage tracking
- `optimiser.js` — Greedy relay placement heuristic
- `serialisation.js` — JSON import/export, PNG screenshot
- `main.js` — Orchestrator: scene setup, interaction, render loop, view switching, dashboard logic (auto-connect, revenue model, HUD updates)
- `terrestrial.js` — OpenStreetMap tile overlay for ground-level detail when camera zooms close

## Gotchas
- Earth does NOT rotate — nodes are in world space, so rotation would desync them from the globe texture
- Earth mesh has `rotation.y = -π/2` to align the texture (SphereGeometry maps texture centre to +X, but Greenwich must be at +Z)
- Lunar nodes use scene coordinates (x,y,z) not lat/lon, since they are on the Moon surface
- ECI→scene mapping: Three.js Y=ECI Z(north), Three.js Z=ECI X, Three.js X=ECI Y
- OrbitControls are disabled during node drag to prevent camera movement
- Link click detection uses invisible cylinder meshes (hitTarget) — Line raycasting is unreliable
- Satellite positions propagate every frame for smooth movement; link budget recomputation is throttled at 10 Hz
- Link visual geometry (line endpoints, arrows) also updates every frame in `updateLinkAnimations()` to track satellite positions smoothly
- In customer view, `#viewport-container` is `position: fixed; width: 100vw; height: 100vh` and `onResize()` uses `window.innerWidth/Height` directly — the flex layout is bypassed entirely
- HUD stat elements (`#hud-left`, `#hud-right`, `#hud-epoch`, `#hud-speed`) are `pointer-events: none`; only buttons capture clicks
- Pointing loss formula: exp(-2 × (σ_pointing / θ_divergence)²) — extremely sensitive when σ > θ. Default tracking accuracy (0.0001 mrad = 100 nrad) must be well below divergence half-angle
- Beam model is Gaussian (not Airy/uniform): divergence = λ/(πw₀), capture = 1−exp(−2(r_rx/w)²). Tighter beam than 1.22λ/D but more pointing-sensitive
- Turbulence model is enabled by default. HV-5/7 integration starts from ground station altitude (not sea level), so high-altitude sites get larger r₀/θ₀. The A·exp(−h/100) ground layer has 100 m scale height — essentially zero above ~500 m
- Atmospheric transmission uses optical scale height H=2 km (not pressure scale height 8.5 km). Zenith transmittance is looked up per beam type + weather from ZENITH_TRANSMISSION table in constants.js
- Point-ahead anisoplanatism dominates for LEO targets: θ_PA ≈ 51 µrad at 400 km, while θ₀ ≈ 15–18 µrad at 1080 nm. This means HO AO correction is ineffective; only tip-tilt helps
- Tilt Strehl uncertainty is ~30–50% (conservative exponential model). HO Strehl is capped at AO_IDEAL_STREHL=0.7
- Transmitter efficiency (Tc) represents internal optical losses only (mirrors, windows, beam combiners) — not wall-plug efficiency. Defaults are 0.92–0.97 depending on node type. Do not confuse with electrical-to-optical conversion
- Demo scene uses MW-class sources with 5 m apertures and 100 nrad tracking to deliver 10s of kW at GEO distance
- Hover tooltips on all technical metrics (both views). Tooltip text is centralised in `tooltip.js` TOOLTIPS registry. Uses `data-tooltip` attributes and event delegation — dynamic elements work automatically
- App defaults to Customer View on startup; toggle button in header switches between views
- Terrestrial tiles (OpenStreetMap) appear automatically when camera is within ~960 km of Earth surface
- GitHub Pages deployed via Actions workflow from develop branch
