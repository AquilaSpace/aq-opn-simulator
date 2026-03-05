# CLAUDE.md — aq-opn-simulator

## Project
Aquila Optical Power Network Simulator. Interactive 3D tool for designing and analysing laser power relay networks across Earth and cislunar space.

## Stack
Vanilla JS + Three.js r160 (ES modules via import map from cdn.jsdelivr.net). No build step. Static site.

## Run
```bash
python3 -m http.server 8080
# or
make serve
```

## Structure
See js/ directory. Each file has a single responsibility. physics.js is pure functions (no DOM). UI files import from data/logic files, never the reverse.

## Coordinate System
Three.js Y-up. 1 scene unit = 1000 km. Earth radius = 6.371 units. North pole = +Y. Greenwich meridian = +Z.
Lat/lon to Cartesian: x = R*cos(lat)*sin(lon), y = R*sin(lat), z = R*cos(lat)*cos(lon).

## Conventions
- SI units internally (W, m, rad, km). Convert at UI boundary only.
- Constants in constants.js. Never hardcode physical values in other files.
- All node/link state lives in nodeManager.js and linkManager.js respectively. UI files read from these, never own state.
- physics.js must have zero imports from other project files (except constants.js). Keep it testable in isolation.
- British English for all prose and user-facing strings.

## Key Modules
- `constants.js` — Scale factors, physical constants, node type registry, beam types, coordinate helpers
- `physics.js` — Pure link budget calculations (aperture-to-aperture model), atmospheric attenuation, LOS
- `nodeManager.js` — Node CRUD, Three.js mesh creation, selection, dragging
- `linkManager.js` — Link CRUD, beam rendering with particles, status colour coding
- `linkBudget.js` — Wraps physics.js for per-link budget computation with node parameters
- `orbitalMechanics.js` — Keplerian propagation (Newton-Raphson Kepler solver), ECI→scene coords
- `timeController.js` — Play/pause/speed, epoch display, orbital + Moon propagation tick
- `optimiser.js` — Greedy relay placement heuristic
- `serialisation.js` — JSON import/export, PNG screenshot
- `main.js` — Orchestrator, scene setup, interaction (raycasting, click-to-add, shift+click links)

## Gotchas
- Lunar nodes use scene coordinates (x,y,z) not lat/lon, since they are on the Moon surface
- ECI→scene mapping: Three.js Y=ECI Z(north), Three.js Z=ECI X, Three.js X=ECI Y
- OrbitControls are disabled during node drag to prevent camera movement
- Link recomputation is throttled at 10 Hz during time playback for performance
- GitHub Pages deployed via Actions workflow from develop branch
