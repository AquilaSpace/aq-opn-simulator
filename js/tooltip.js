/**
 * tooltip.js — Hover tooltip system. Any element with a `data-tooltip` attribute
 * shows a floating explanation bubble on mouse hover.
 *
 * Uses event delegation on `document` so dynamically created elements work
 * automatically — no per-element listener setup required.
 */

// ---------------------------------------------------------------------------
// Tooltip element
// ---------------------------------------------------------------------------

const _tooltip = document.createElement('div');
_tooltip.className = 'info-tooltip';
_tooltip.setAttribute('role', 'tooltip');
document.body.appendChild(_tooltip);

let _hideTimer = null;
let _currentTarget = null;

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

function _position(target) {
    const rect = target.getBoundingClientRect();
    const tipRect = _tooltip.getBoundingClientRect();
    const pad = 8;

    // Default: above the element, horizontally centred
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top = rect.top - tipRect.height - pad;

    // If it would go off the top, show below instead
    if (top < pad) {
        top = rect.bottom + pad;
    }

    // Clamp horizontally
    left = Math.max(pad, Math.min(left, window.innerWidth - tipRect.width - pad));

    _tooltip.style.left = left + 'px';
    _tooltip.style.top = top + 'px';
}

// ---------------------------------------------------------------------------
// Show / hide
// ---------------------------------------------------------------------------

function _show(target) {
    const text = target.getAttribute('data-tooltip');
    if (!text) return;

    clearTimeout(_hideTimer);
    _currentTarget = target;

    _tooltip.textContent = text;
    _tooltip.style.display = 'block';
    _tooltip.style.opacity = '0';

    // Position after layout
    requestAnimationFrame(() => {
        _position(target);
        _tooltip.style.opacity = '1';
    });
}

function _hide() {
    _hideTimer = setTimeout(() => {
        _tooltip.style.opacity = '0';
        setTimeout(() => {
            if (_tooltip.style.opacity === '0') {
                _tooltip.style.display = 'none';
            }
        }, 150);
        _currentTarget = null;
    }, 80);
}

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------

document.addEventListener('mouseenter', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) _show(target);
}, true);

document.addEventListener('mouseleave', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target && target === _currentTarget) _hide();
}, true);

// Hide on scroll / resize to avoid stale positions
window.addEventListener('scroll', () => _hide(), true);
window.addEventListener('resize', () => _hide());

// ---------------------------------------------------------------------------
// Tooltip definitions — central registry of explanations
// ---------------------------------------------------------------------------

export const TOOLTIPS = {
    // -- HUD / Customer View stats (on wrapper .hud-stat) --
    'dash-stat-sources-item':
        'Ground-based power generation facilities (solar, nuclear, grid) that feed optical energy into the network.',
    'dash-stat-relays-item':
        'GEO relay satellites that receive and retransmit laser beams, extending network reach across the globe.',
    'dash-stat-orbital-customers-item':
        'Orbital platforms (e.g. ISS, LEO constellations) receiving wireless optical power.',
    'dash-stat-ground-customers-item':
        'Terrestrial endpoints consuming delivered optical power.',
    'dash-stat-links-active-item':
        'Laser power links currently transmitting with sufficient margin above the receiver\'s required power.',
    'dash-stat-power-item':
        'Total optical power arriving at all receiver apertures across active and marginal links.',
    'dash-stat-revenue-item':
        'Cumulative revenue at $250 per customer per 15 minutes of continuous power access.',
    'dash-stat-uptime-item':
        'Average percentage of simulation time each customer has received sufficient power from the network.',

    // -- Engineer View — Network Overview stats (on wrapper .stat-item) --
    'stat-nodes-item':
        'Total network nodes: sources, relays, and customers across ground, orbit, and lunar locations.',
    'stat-links-item':
        'Total directed power links between nodes. Each link carries a laser beam from transmitter to receiver.',
    'stat-active-item':
        'Links transmitting with \u22653 dB margin above the receiver\u2019s required power. Healthy links.',
    'stat-marginal-item':
        'Links transmitting but with <3 dB margin \u2014 at risk of dropping below required power if conditions degrade.',
    'stat-broken-item':
        'Links with no line-of-sight (Earth/Moon occultation) or received power below the required threshold.',
    'stat-power-gen-item':
        'Sum of received optical power across all active and marginal links in the network.',

    // -- Link Inspector budget rows --
    'budget-tx-power':
        'Optical output power of the transmitter node. Set per-node in the Node Editor.',
    'budget-tx-efficiency':
        'Fraction of transmit power that exits the aperture as usable beam. Accounts for internal optical losses.',
    'budget-wavelength':
        'Laser wavelength. Affects beam divergence (\u03b8 \u221d \u03bb/D) and atmospheric absorption windows.',
    'budget-distance':
        'Straight-line distance between transmitter and receiver apertures.',
    'budget-divergence':
        'Gaussian beam 1/e\u00b2 half-angle divergence: \u03b8 = \u03bb/(\u03c0w\u2080). Smaller divergence = tighter beam = more power on target.',
    'budget-beam-diameter':
        '1/e\u00b2 beam diameter at the receiver. w(z) = w\u2080\u221a(1 + (z/z_R)\u00b2). Larger spot means less power captured.',
    'budget-tx-aperture':
        'Transmitter aperture diameter. Larger aperture = smaller beam divergence = more power delivered at range.',
    'budget-rx-aperture':
        'Receiver aperture diameter. Larger receiver captures a greater fraction of the beam spot.',
    'budget-capture':
        'Fraction of beam power intercepted by the receiver aperture. Gaussian model: \u03b7 = 1 \u2212 exp(\u22122(r_rx/w)\u00b2).',
    'budget-pointing':
        'Power loss due to beam pointing jitter. exp(\u22122(\u03c3/\u03b8)\u00b2) \u2014 tighter beams are more sensitive to tracking error.',
    'budget-atm-loss':
        'Atmospheric attenuation via exponential scale-height model. Depends on elevation angle, altitude, and weather condition.',
    'budget-path-loss':
        'Total end-to-end loss from transmitter to receiver in dB, including all loss terms.',
    'budget-elevation':
        'Angle above local horizon at the lower endpoint. Low elevation = longer atmospheric path = more attenuation.',
    'budget-los':
        'Line-of-sight check: whether the straight-line beam path is occluded by Earth or Moon.',
    'budget-rx-power':
        'Optical power arriving at the receiver: P_tx \u00d7 efficiency \u00d7 capture \u00d7 pointing loss \u00d7 atmospheric transmission.',
    'budget-required':
        'Minimum optical power the receiver node needs, set in its node parameters.',
    'budget-margin':
        'Received power minus required power in dB. \u22653 dB = Active (green), 0\u20133 dB = Marginal (amber), <0 dB = Broken (red).',

    // -- Node Editor parameters --
    'ne-tx-power':
        'Optical output power of the laser transmitter in kilowatts.',
    'ne-tx-efficiency':
        'Optical-to-optical transmitter efficiency. 1.0 = no internal loss. Typical fibre laser: 0.85\u20130.95.',
    'ne-aperture':
        'Primary optical aperture diameter. Beam divergence \u03b8 = \u03bb/(\u03c0 \u00d7 D/2) \u2014 larger aperture = tighter beam.',
    'ne-tracking':
        '1-sigma pointing jitter of the beam steering system (milliradians). Pointing loss = exp(\u22122(\u03c3/\u03b8)\u00b2).',
    'ne-total-power':
        'Total power budget of the source facility. Shared across all output beams.',
    'ne-output-beams':
        'Number of simultaneous laser output beams the source can produce.',
    'ne-rx-aperture':
        'Receive aperture diameter for incoming beams. May differ from the transmit aperture.',
    'ne-retx-eff':
        'Receive-and-retransmit efficiency. Power forwarded = power received \u00d7 this factor.',
    'ne-max-links':
        'Maximum number of simultaneous laser links this relay node can maintain.',
    'ne-required-power':
        'Minimum optical power this customer needs for its application (kW).',
    'ne-uptime':
        'Percentage of simulation time this node has received sufficient power from at least one active link.',
    'ne-latitude':
        'Geodetic latitude in degrees. North is positive.',
    'ne-longitude':
        'Geodetic longitude in degrees. East is positive.',
    'ne-altitude':
        'Altitude above Earth\u2019s surface in kilometres.',
    'ne-sma':
        'Semi-major axis of the orbit in km. Determines orbital period. GEO = 42,164 km.',
    'ne-eccentricity':
        'Orbital eccentricity. 0 = circular, approaching 1 = highly elliptical.',
    'ne-inclination':
        'Angle between the orbital plane and Earth\u2019s equatorial plane. 0\u00b0 = equatorial, 90\u00b0 = polar.',
    'ne-raan':
        'Right Ascension of Ascending Node \u2014 orientation of the orbit\u2019s ascending node relative to the vernal equinox.',
    'ne-aop':
        'Argument of Perigee \u2014 angle from the ascending node to the closest approach point.',
    'ne-true-anomaly':
        'Current angular position of the satellite along its orbit, measured from perigee.',
    'ne-speed':
        'Ground speed of the mobile platform in metres per second.',
    'ne-heading':
        'Direction of travel in degrees clockwise from north (0\u00b0 = north, 90\u00b0 = east).',

    // -- Beam Settings (on wrapper .control-row) --
    'beam-type-row':
        'Laser wavelength preset. Affects beam divergence, atmospheric absorption, and eye-safety classification.',
    'custom-wavelength-row':
        'Custom laser wavelength in nanometres. Shorter wavelengths give tighter beams but may have higher atmospheric loss.',
    'atm-condition-row':
        'Atmospheric weather condition. Affects extinction coefficient: clear ~0.2 dB/km, haze ~1.5 dB/km, rain ~4 dB/km (at 1080 nm).',
};

// ---------------------------------------------------------------------------
// Auto-apply tooltips to static HTML elements by id
// ---------------------------------------------------------------------------

/**
 * Apply tooltips to all static elements whose `id` matches a key in the
 * TOOLTIPS registry. Call once after DOM is ready.
 */
export function applyStaticTooltips() {
    for (const [id, text] of Object.entries(TOOLTIPS)) {
        const el = document.getElementById(id);
        if (el) {
            el.setAttribute('data-tooltip', text);
        }
    }
}
