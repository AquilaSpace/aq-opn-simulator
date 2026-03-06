# Aquila Optical Power Network

Interactive 3D simulation tool for designing and analysing laser/optical wireless power transmission networks across Earth and cislunar space. Part of Aquila Space Technologies' "Internet of Energy" vision.

**[Live Demo](https://aquilaspace.github.io/aq-opn-simulator/)**

<img width="3200" height="1660" alt="Screenshot 2026-03-05 200506" src="https://github.com/user-attachments/assets/55ca67b9-1f44-4284-a9ce-15663857225d" />


## Features

### Two Views
- **Engineer View** — Full sidebar with node editor, link inspector, beam settings, network stats, and time controls. For detailed network design and analysis.
- **Customer View** — Clean full-screen HUD overlay for demonstrations. One-click deployment of sources, relays, and customers with auto-connect. Revenue and power delivery tracking. Suitable for non-technical audiences.

### Core
- **3D Globe Scene** — Textured Earth and Moon at correct relative scale and distance, with starfield background and atmospheric glow
- **Node System** — Place and configure ground sources, ground/orbital relays, ground/orbital customers, lunar installations, and mobile platforms
- **Power Links** — Directed laser power links with colour-coded health status (active/marginal/broken) and animated energy flow particles. Link visuals track satellite positions smoothly every frame.
- **Link Budget Analysis** — Full aperture-to-aperture optical link budget: transmit power, diffraction-limited beam divergence (1.22 λ/D), atmospheric scale-height attenuation, receiver capture fraction, pointing loss, and margin over required power
- **Beam Types** — Selectable wavelengths (1080 nm Yb fibre, 1550 nm eye-safe, 532 nm visible, custom) with per-link overrides
- **Orbital Mechanics** — Keplerian propagation with J2 perturbation for satellite nodes; smooth per-frame position updates with throttled link recomputation. Time controller with play/pause/speed up to 10000×
- **Relay Optimiser** — Greedy heuristic auto-suggests relay placements to connect sources to customers
- **Auto-Connect** — Dashboard mode auto-links sources→relays→customers via nearest-neighbour, with duplicate detection
- **Revenue Model** — Tracks revenue at $250 per 15 minutes of customer access to a power source
- **Uptime Tracking** — Per-customer power uptime percentage, averaged across the network
- **Serialisation** — JSON export/import of full network state; PNG viewport screenshot
- **Terrestrial Zoom** — Zoom into city/landscape level with OpenStreetMap tile overlay for ground-level node placement
- **Camera Presets** — Quick viewpoint switching with smooth animated transitions (Earth, LEO, GEO, Cislunar, Moon, Sydney ground level)
- **Demo Scene** — Pre-built Earth–Moon power relay network delivering 10s of kW, loaded on first visit

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
├── index.html              # Single-page app — engineer + customer views
├── style.css               # All styling — dark theme, panels, HUD overlay
├── dashboard.html          # Standalone customer dashboard (separate page, legacy)
├── dashboard.css           # Standalone dashboard styles
├── Makefile                # Dev shortcuts (make serve)
├── CLAUDE.md               # Claude Code project context
├── README.md               # This file
├── js/
│   ├── main.js             # Scene setup, interaction, render loop, dashboard logic
│   ├── dashboard.js        # Standalone dashboard entry point (legacy)
│   ├── constants.js        # Physical constants, scale factors, node type definitions
│   ├── physics.js          # Pure calculation engine — link budgets, attenuation, LOS
│   ├── earth.js            # Earth + Moon globe rendering
│   ├── nodeManager.js      # Node CRUD, type registry, 3D mesh creation
│   ├── linkManager.js      # Power link management, beam line rendering
│   ├── linkBudget.js       # Per-link budget calculations
│   ├── orbitalMechanics.js # Keplerian propagation with J2, coordinate conversions
│   ├── optimiser.js        # Greedy relay placement engine
│   ├── uptimeTracker.js    # Per-node power uptime tracking
│   ├── uiPanel.js          # Sidebar panel utilities
│   ├── nodeEditor.js       # Node property editor panel
│   ├── linkInspector.js    # Link budget display panel
│   ├── timeController.js   # Time slider, play/pause, epoch display
│   ├── networkGraph.js     # Network topology state, metrics
│   ├── serialisation.js    # JSON export/import, PNG export
│   ├── sceneHelpers.js     # Lighting, starfield, coordinate axes
│   ├── cameraPresets.js    # Named camera positions with smooth transitions
│   └── terrestrial.js      # Ground-level OpenStreetMap tile overlay
```

## Key Concepts

### Node Types

| Type | Description |
|---|---|
| Ground Source | Terrestrial power generation (solar, nuclear, grid) |
| Ground Relay | Ground-based repeater tower |
| Ground Customer | Ground-based power consumer endpoint |
| Orbital Relay | Satellite relay in Earth orbit (typically GEO) |
| Orbital Customer | Satellite or station receiving power in orbit |
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
