# Aquila OPN Simulator — Optical Power Network

Interactive 3D simulation tool for designing and analysing laser/optical wireless power transmission networks across Earth and cislunar space. Part of Aquila Space Technologies' "Internet of Energy" vision.

**[Live Demo](https://aquilaspace.github.io/aq-opn-simulator/)**

<img width="3200" height="1660" alt="Screenshot 2026-03-05 200506" src="https://github.com/user-attachments/assets/55ca67b9-1f44-4284-a9ce-15663857225d" />


## Features

- **3D Globe Scene** — Textured Earth and Moon at correct relative scale and distance, with starfield background and atmospheric glow
- **Node System** — Place and configure power sources, relays, customers, orbital satellites, and lunar installations
- **Power Links** — Directed laser power links with colour-coded health status (active/marginal/broken) and animated energy flow particles
- **Link Budget Analysis** — Full aperture-to-aperture optical link budget: transmit power, beam divergence, atmospheric attenuation, receiver capture, pointing loss, and margin
- **Beam Types** — Selectable wavelengths (1080nm Yb fibre, 1550nm eye-safe, 532nm visible, custom) with per-link overrides
- **Orbital Mechanics** — Keplerian propagation for satellite nodes; time controller with play/pause/speed for dynamic link analysis
- **Relay Optimiser** — Greedy heuristic auto-suggests relay placements to connect sources to customers
- **Serialisation** — JSON export/import of full network state; PNG viewport screenshot
- **Terrestrial Zoom** — Zoom into city/landscape level with OpenStreetMap tile overlay for ground-level node placement
- **Camera Presets** — Quick viewpoint switching with smooth animated transitions (Earth, LEO, GEO, Cislunar, Moon, Sydney ground level)
- **Demo Scene** — Pre-built Earth–Moon power relay network loaded on first visit

## Running Locally

```bash
# Python
python3 -m http.server 8080

# Make
make serve

# npx
npx serve .

# Docker
docker run --rm -p 8080:80 -v $(pwd):/usr/share/nginx/html:ro nginx:alpine
```

Then open [http://localhost:8080](http://localhost:8080).

## Project Structure

```
aq-opn-simulator/
├── index.html              # Main page — layout, UI panels, import map
├── style.css               # All styling — dark theme, panels, controls
├── Makefile                # Dev shortcuts (make serve)
├── CLAUDE.md               # Claude Code project context
├── README.md               # This file
├── js/
│   ├── main.js             # Scene setup, renderer, camera, orbit controls, render loop
│   ├── constants.js        # Physical constants, scale factors, node type definitions
│   ├── physics.js          # Pure calculation engine — link budgets, attenuation, LOS
│   ├── earth.js            # Earth + Moon globe rendering
│   ├── nodeManager.js      # Node CRUD, type registry, 3D mesh creation
│   ├── linkManager.js      # Power link management, beam line rendering
│   ├── linkBudget.js       # Per-link budget calculations
│   ├── orbitalMechanics.js # Keplerian propagation, coordinate conversions
│   ├── optimiser.js        # Greedy relay placement engine
│   ├── uiPanel.js          # Sidebar panel utilities
│   ├── nodeEditor.js       # Node property editor panel
│   ├── linkInspector.js    # Link budget display panel
│   ├── timeController.js   # Time slider, play/pause, epoch display
│   ├── networkGraph.js     # Network topology state, metrics
│   ├── serialisation.js    # JSON export/import, PNG export
│   ├── sceneHelpers.js     # Lighting, starfield, coordinate axes
│   ├── cameraPresets.js    # Named camera positions
│   └── terrestrial.js      # Ground-level OpenStreetMap tile overlay
```

## Key Concepts

### Node Types

| Type | Description |
|---|---|
| Ground Source | Terrestrial power generation (solar, nuclear, grid) |
| Ground Relay | Ground-based repeater tower |
| Ground Customer | Power consumer endpoint |
| Orbital Relay | Satellite relay in Earth orbit |
| Lunar Node | Lunar surface installation |
| Mobile Node | Drone, aircraft, or mobile platform |

### Link Budget

Uses an aperture-to-aperture optical beam propagation model:
- Beam divergence (diffraction-limited by default)
- Atmospheric attenuation (scale-height model with weather conditions)
- Receiver capture fraction
- Pointing/tracking loss

### Beam Types

| Type | Wavelength | Use Case |
|---|---|---|
| Yb Fibre (default) | 1080 nm | High-power terrestrial and space |
| Eye-Safe Telecom | 1550 nm | Urban / eye-safe corridors |
| Freq-Doubled Green | 532 nm | Visible reference / underwater |
| Custom | User-defined | — |

## Licence

Proprietary. Internal use only. © Aquila Space Technologies.
