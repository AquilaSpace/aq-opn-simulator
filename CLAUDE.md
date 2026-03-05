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
