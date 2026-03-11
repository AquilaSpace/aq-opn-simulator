/**
 * turbulenceModel.js — Atmospheric turbulence corrections for ground-to-space uplinks.
 *
 * For ground-to-LEO uplinks at 1080 nm, higher-order adaptive optics is ineffective
 * due to point-ahead anisoplanatism (point-ahead angle ~25–50 µrad exceeds isoplanatic
 * angle ~15–20 µrad). Only tip-tilt correction provides meaningful improvement.
 * The beam spot is turbulence-broadened, not diffraction-limited.
 *
 * Pure functions — no DOM dependencies. Only imports from constants.js.
 */

import { KARMAN_LINE_KM } from './constants.js';

// ---------------------------------------------------------------------------
// Global turbulence state
// ---------------------------------------------------------------------------

/** Whether turbulence corrections are enabled */
let _enabled = false;

/** Turbulence parameters (mutable via setTurbulenceParams) */
let _params = {
    r0_cm: 12,              // Fried parameter at zenith (cm). 5=poor, 12=median, 20=good, 28=excellent
    tiptiltGain: 0.6,       // Tip-tilt correction effectiveness (0=none, 0.6=good, 0.9=excellent)
    Cn2: 1e-14,             // Ground-level refractive index structure constant (m^-2/3)
    turbulenceHeight_m: 10000,  // Effective turbulence layer height (m)
};

// ---------------------------------------------------------------------------
// Getters / setters
// ---------------------------------------------------------------------------

export function isTurbulenceEnabled() { return _enabled; }
export function setTurbulenceEnabled(enabled) { _enabled = !!enabled; }

export function getTurbulenceParams() { return { ..._params }; }
export function setTurbulenceParams(newParams) {
    _params = { ..._params, ...newParams };
}

// ---------------------------------------------------------------------------
// Turbulence-limited beam spot
// ---------------------------------------------------------------------------

/**
 * Compute the turbulence-broadened beam spot diameter at the receiver.
 *
 * When the transmit aperture exceeds r₀, the effective aperture is limited by
 * turbulence. Beam wander (from large-scale turbulence cells) further broadens
 * the long-exposure spot. Tip-tilt correction removes a fraction of the wander.
 *
 * @param {number} wavelength_m — laser wavelength in metres
 * @param {number} distance_m — link distance in metres
 * @param {number} txDiameter_m — transmit aperture diameter in metres
 * @param {number} r0_m — Fried parameter in metres (at zenith, corrected for elevation)
 * @param {number} tiptiltGain — tip-tilt correction effectiveness (0–1)
 * @returns {number} turbulence-broadened 1/e² spot diameter at receiver (m)
 */
export function computeTurbulenceSpot(wavelength_m, distance_m, txDiameter_m, r0_m, tiptiltGain) {
    // Effective aperture limited by turbulence
    const effAperture = Math.min(txDiameter_m, r0_m);

    // Short-exposure diffraction spot from effective aperture
    // Using 2.44λ/D as the Airy-equivalent spot width, mapped to Gaussian 1/e²
    const shortExpSpot = 2.44 * wavelength_m * distance_m / Math.max(effAperture, r0_m * 0.5);

    // Beam wander RMS displacement (Sasiela model)
    // σ_wander ≈ 0.73 × (D/r₀)^(5/6) × (λz/D)
    const wanderRms = 0.73 * Math.pow(txDiameter_m / r0_m, 5.0 / 6.0)
        * (wavelength_m * distance_m / txDiameter_m);
    const residualWander = wanderRms * (1.0 - tiptiltGain);

    // Long-exposure spot with tip-tilt: RSS of short-exp and residual wander
    // Factor 2.35 converts RMS displacement to equivalent spot broadening
    const turbSpot = Math.sqrt(shortExpSpot ** 2 + (2.35 * residualWander) ** 2);

    return turbSpot;
}

/**
 * Compute the Fried parameter r₀ corrected for elevation angle.
 * At zenith r₀ is maximum; at lower elevations the path through turbulence
 * is longer, reducing r₀.
 *
 * r₀(el) = r₀(zenith) × sin(el)^(3/5)
 *
 * @param {number} r0Zenith_m — Fried parameter at zenith (m)
 * @param {number} elevAngle_rad — elevation angle above horizon (rad)
 * @returns {number} elevation-corrected r₀ in metres
 */
export function r0ForElevation(r0Zenith_m, elevAngle_rad) {
    const sinEl = Math.max(Math.sin(elevAngle_rad), 0.05);
    return r0Zenith_m * Math.pow(sinEl, 3.0 / 5.0);
}

// ---------------------------------------------------------------------------
// Scintillation loss
// ---------------------------------------------------------------------------

/**
 * Compute scintillation power loss factor for an uplink through turbulence.
 *
 * Uses the Rytov variance to estimate the fraction of power lost to
 * intensity fluctuations (scintillation).
 *
 * @param {number} wavelength_m — laser wavelength (m)
 * @param {number} distance_m — total link distance (m)
 * @param {number} Cn2 — ground-level refractive index structure constant (m^-2/3)
 * @param {number} turbHeight_m — effective turbulence layer height (m)
 * @returns {number} power-in-bucket fraction (0–1), multiply into link budget
 */
export function computeScintillationLoss(wavelength_m, distance_m, Cn2, turbHeight_m) {
    const k = 2 * Math.PI / wavelength_m;
    // Effective propagation distance through turbulence (capped at turbulence height)
    const Leff = Math.min(distance_m, turbHeight_m);
    const rytov = 1.23 * Cn2 * Math.pow(k, 7.0 / 6.0) * Math.pow(Leff, 11.0 / 6.0);
    // Power-in-bucket: approximate loss from log-normal intensity distribution
    // Capped at Rytov = 3 (saturation regime)
    return Math.exp(-0.5 * Math.min(rytov, 3.0));
}

// ---------------------------------------------------------------------------
// Combined turbulence correction for a link
// ---------------------------------------------------------------------------

/**
 * Determine whether a link traverses the atmosphere (ground-to-space or space-to-ground).
 *
 * @param {number} alt1_km — altitude of endpoint 1 (km above Earth surface)
 * @param {number} alt2_km — altitude of endpoint 2 (km above Earth surface)
 * @returns {boolean} true if link is ground-to-space (one endpoint below Kármán line)
 */
export function isGroundToSpaceLink(alt1_km, alt2_km) {
    const lo = Math.min(alt1_km, alt2_km);
    const hi = Math.max(alt1_km, alt2_km);
    return lo < KARMAN_LINE_KM && hi >= KARMAN_LINE_KM;
}

/**
 * Compute combined turbulence correction factors for a ground-to-space link.
 * Returns both a modified beam diameter at the receiver and a scintillation loss factor.
 *
 * If turbulence is disabled or the link is space-to-space, returns null
 * (meaning: use the diffraction-limited beam model as-is).
 *
 * @param {object} opts
 * @param {number} opts.wavelength_m
 * @param {number} opts.distance_m
 * @param {number} opts.txApertureDiameter_m
 * @param {number} opts.alt1_km — altitude of transmitter
 * @param {number} opts.alt2_km — altitude of receiver
 * @param {number} opts.elevAngle_rad — elevation angle at lower endpoint
 * @returns {object|null} { turbBeamDiameter_m, scintillationLoss } or null
 */
export function computeTurbulenceCorrection(opts) {
    if (!_enabled) return null;
    if (!isGroundToSpaceLink(opts.alt1_km, opts.alt2_km)) return null;

    const r0Zenith_m = _params.r0_cm / 100;
    const r0_m = r0ForElevation(r0Zenith_m, opts.elevAngle_rad);

    const turbBeamDiameter_m = computeTurbulenceSpot(
        opts.wavelength_m,
        opts.distance_m,
        opts.txApertureDiameter_m,
        r0_m,
        _params.tiptiltGain,
    );

    const scintillationLoss = computeScintillationLoss(
        opts.wavelength_m,
        opts.distance_m,
        _params.Cn2,
        _params.turbulenceHeight_m,
    );

    return { turbBeamDiameter_m, scintillationLoss, r0_m };
}
