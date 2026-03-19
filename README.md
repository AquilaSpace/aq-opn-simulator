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
- **Link Budget Analysis** — Full Gaussian beam optical link budget: transmit power, diffraction-limited divergence (θ = λ/πw₀), Gaussian capture fraction (1 − exp(−2r²/w²)), zenith-transmittance atmospheric model (H=2 km optical scale height), pointing loss, and margin over required power
- **Atmospheric Turbulence** — HV-5/7 Cn² profile integration for r₀ and θ₀, wavelength scaling, elevation correction, point-ahead anisoplanatism, Noll 87/13 tilt/HO Strehl decomposition, and ground station altitude-aware integration. Enabled by default.
- **Hover Tooltips** — Every technical metric, parameter, and statistic has a hover tooltip explaining what it is, how it is calculated, and what affects it
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
│   ├── turbulenceModel.js  # HV-5/7 atmospheric turbulence model
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
│   ├── terrestrial.js      # Ground-level OpenStreetMap tile overlay
│   └── tooltip.js          # Hover tooltip system with centralised definitions
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

Uses a Gaussian beam propagation model (aperture-to-aperture):
- **Beam divergence** — Diffraction-limited Gaussian: θ = λ / (π × w₀), where w₀ = D/2
- **Beam expansion** — w(z) = w₀ √(1 + (z/z_R)²), with Rayleigh range z_R = πw₀²/λ
- **Capture fraction** — Gaussian integral over receiver aperture: η = 1 − exp(−2(r_rx/w)²)
- **Pointing loss** — exp(−2(σ_pointing/θ_divergence)²)
- **Atmospheric attenuation** — Zenith transmittance lookup (per beam type/weather) with optical extinction scale height (H = 2 km) and slant-path correction: T = exp(−τ₀ × exp(−h/H) / sin(el))
- **Turbulence model** — HV-5/7 Cn²(h) profile numerically integrated from station altitude to 25 km (50 m bins). Computes Fried parameter r₀ and isoplanatic angle θ₀ at 500 nm, wavelength-scaled via (λ/500nm)^(6/5), elevation-corrected. Point-ahead angle θ_PA = 2v_orbit/c. Noll decomposition: 87% tilt wander, 13% higher-order. Tilt Strehl S_TT = exp(−(θ_PA/θ_TA)^(5/3)), HO Strehl S_HO = 0.7 × exp(−(θ_PA/θ₀)^(5/3)). Effective spot combines diffraction, residual wander, and residual HO in quadrature

### Beam Types

| Type | Wavelength | Use Case |
|---|---|---|
| Yb Fibre (default) | 1080 nm | High-power terrestrial and space |
| Eye-Safe Telecom | 1550 nm | Urban / eye-safe corridors |
| Freq-Doubled Green | 532 nm | Visible reference / underwater |
| Custom | User-defined | — |

## Licence

Proprietary. Internal use only. © Aquila Space Technologies.
