/**
 * turbulenceModel.js — Atmospheric turbulence corrections for ground-to-space links.
 *
 * Implements HV-5/7 Cn2 profile integration for r0 and theta0 at 500 nm zenith,
 * wavelength scaling, elevation scaling, point-ahead angle computation,
 * tilt/HO isoplanatic Strehl ratios (Noll 87/13 decomposition), and effective
 * spot-size calculation combining diffraction, wander, and short-exposure seeing.
 *
 * Pure functions — no DOM dependencies. Only imports from constants.js.
 */

import {
    KARMAN_LINE_KM, SPEED_OF_LIGHT, EARTH_RADIUS_KM,
    GM_EARTH_M3S2, NOLL_TILT_FRACTION, NOLL_HO_FRACTION,
    TURBULENCE_REF_WAVELENGTH_M, AO_IDEAL_STREHL,
} from './constants.js';

// ---------------------------------------------------------------------------
// Global turbulence state
// ---------------------------------------------------------------------------

/** Whether turbulence corrections are enabled */
let _enabled = true;

/** Turbulence parameters (mutable via setTurbulenceParams) */
let _params = {
    windSpeed_ms: 21,       // High-altitude wind speed (m/s), HV-5/7 default = 21
    tiptiltGain: 0.6,       // Tip-tilt correction effectiveness (0=none, 0.6=good, 0.9=excellent)
    Cn2: 1.7e-14,           // Ground-level refractive index structure constant (m^-2/3)
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
// HV-5/7 Cn2 profile integration
// ---------------------------------------------------------------------------

/**
 * Compute r0 and theta0 at the reference wavelength (500 nm) for zenith path
 * using the Hufnagel-Valley 5/7 Cn2(h) profile with numerical integration.
 *
 * Cn2(h) = 5.94e-53 * (V/27)^2 * h^10 * exp(-h/1000)
 *        + 2.7e-16 * exp(-h/1500)
 *        + A * exp(-h/100)
 *
 * @param {number} V — high-altitude wind speed (m/s)
 * @param {number} A — ground-level Cn2 (m^-2/3)
 * @param {number} hStart_m — altitude of the ground station above sea level (m);
 *        integration starts here, skipping turbulence below the transmitter
 * @returns {{ r0_500nm_m: number, theta0_500nm_rad: number }}
 */
function integrateHV57(V, A, hStart_m = 0) {
    const k = 2 * Math.PI / TURBULENCE_REF_WAVELENGTH_M;
    const dh = 50;       // 50 m bins
    const hMax = 25000;  // 25 km ceiling
    const hMin = Math.max(hStart_m, 0);

    let intCn2 = 0;      // integral of Cn2 dh
    let intCn2h53 = 0;   // integral of Cn2 * h^(5/3) dh

    for (let h = hMin + dh / 2; h < hMax; h += dh) {
        const term1 = 5.94e-53 * Math.pow(V / 27, 2) * Math.pow(h, 10) * Math.exp(-h / 1000);
        const term2 = 2.7e-16 * Math.exp(-h / 1500);
        const term3 = A * Math.exp(-h / 100);
        const cn2 = term1 + term2 + term3;

        intCn2 += cn2 * dh;
        intCn2h53 += cn2 * Math.pow(h, 5.0 / 3.0) * dh;
    }

    // r0 = [0.423 * k^2 * integral(Cn2 dh)]^(-3/5)
    const r0 = Math.pow(0.423 * k * k * intCn2, -3.0 / 5.0);

    // theta0 = [2.914 * k^2 * integral(Cn2 * h^(5/3) dh)]^(-3/5)
    const theta0 = Math.pow(2.914 * k * k * intCn2h53, -3.0 / 5.0);

    return { r0_500nm_m: r0, theta0_500nm_rad: theta0 };
}

// ---------------------------------------------------------------------------
// Wavelength scaling
// ---------------------------------------------------------------------------

/**
 * Scale r0 or theta0 from the 500 nm reference to an arbitrary wavelength.
 * r0(lambda) = r0(500nm) * (lambda / 500nm)^(6/5)
 */
function scaleWavelength(value_500nm, wavelength_m) {
    return value_500nm * Math.pow(wavelength_m / TURBULENCE_REF_WAVELENGTH_M, 6.0 / 5.0);
}

// ---------------------------------------------------------------------------
// Elevation scaling
// ---------------------------------------------------------------------------

/**
 * r0(el) = r0(zenith) * sin(el)^(3/5)
 */
export function r0ForElevation(r0Zenith_m, elevAngle_rad) {
    const sinEl = Math.max(Math.sin(elevAngle_rad), 0.05);
    return r0Zenith_m * Math.pow(sinEl, 3.0 / 5.0);
}

/**
 * theta0(el) = theta0(zenith) * sin(el)^(8/5)
 */
function theta0ForElevation(theta0Zenith_rad, elevAngle_rad) {
    const sinEl = Math.max(Math.sin(elevAngle_rad), 0.05);
    return theta0Zenith_rad * Math.pow(sinEl, 8.0 / 5.0);
}

// ---------------------------------------------------------------------------
// Point-ahead angle
// ---------------------------------------------------------------------------

/**
 * Compute the point-ahead angle for a ground-to-satellite link.
 * theta_PA = 2 * v_orbit / c
 *
 * @param {number} satAltitude_km — satellite altitude above Earth surface (km)
 * @returns {number} point-ahead angle in radians
 */
function computePointAhead(satAltitude_km) {
    const r_m = (EARTH_RADIUS_KM + satAltitude_km) * 1000;
    const v_orbit = Math.sqrt(GM_EARTH_M3S2 / r_m);
    return 2 * v_orbit / SPEED_OF_LIGHT;
}

// ---------------------------------------------------------------------------
// Scintillation loss
// ---------------------------------------------------------------------------

/**
 * Compute scintillation power loss factor for an uplink through turbulence.
 *
 * @param {number} wavelength_m — laser wavelength (m)
 * @param {number} distance_m — total link distance (m)
 * @param {number} Cn2 — ground-level Cn2 (m^-2/3)
 * @param {number} [groundAlt_m=0] — ground station altitude above sea level (m)
 * @returns {number} power-in-bucket fraction (0-1)
 */
export function computeScintillationLoss(wavelength_m, distance_m, Cn2, groundAlt_m = 0) {
    const k = 2 * Math.PI / wavelength_m;
    // Effective Cn2 at station altitude (ground term scale height ~100 m)
    const Cn2_eff = Cn2 * Math.exp(-groundAlt_m / 100);
    // Effective propagation through turbulence layer (~10 km above station)
    const Leff = Math.min(distance_m, 10000);
    const rytov = 1.23 * Cn2_eff * Math.pow(k, 7.0 / 6.0) * Math.pow(Leff, 11.0 / 6.0);
    return Math.exp(-0.5 * Math.min(rytov, 3.0));
}

// ---------------------------------------------------------------------------
// Link atmosphere classification
// ---------------------------------------------------------------------------

/**
 * Determine whether a link traverses the atmosphere.
 */
export function isGroundToSpaceLink(alt1_km, alt2_km) {
    const lo = Math.min(alt1_km, alt2_km);
    const hi = Math.max(alt1_km, alt2_km);
    return lo < KARMAN_LINE_KM && hi >= KARMAN_LINE_KM;
}

// ---------------------------------------------------------------------------
// Combined turbulence correction for a link
// ---------------------------------------------------------------------------

/**
 * Compute combined turbulence correction factors for a ground-to-space link.
 *
 * Returns expanded result including r0, theta0, point-ahead, Strehl ratios,
 * and the effective turbulence-broadened beam diameter.
 *
 * @param {object} opts
 * @param {number} opts.wavelength_m
 * @param {number} opts.distance_m
 * @param {number} opts.txApertureDiameter_m
 * @param {number} opts.alt1_km
 * @param {number} opts.alt2_km
 * @param {number} opts.elevAngle_rad
 * @param {number} opts.satAltitude_km — altitude of the satellite endpoint (km)
 * @returns {object|null}
 */
export function computeTurbulenceCorrection(opts) {
    if (!_enabled) return null;
    if (!isGroundToSpaceLink(opts.alt1_km, opts.alt2_km)) return null;

    const { wavelength_m, distance_m, txApertureDiameter_m, elevAngle_rad, satAltitude_km } = opts;
    const D = txApertureDiameter_m;

    // Ground station altitude — the lower endpoint
    const groundAlt_km = Math.max(Math.min(opts.alt1_km, opts.alt2_km), 0);
    const groundAlt_m = groundAlt_km * 1000;

    // HV-5/7 integration at 500 nm zenith, starting from station altitude
    const { r0_500nm_m, theta0_500nm_rad } = integrateHV57(_params.windSpeed_ms, _params.Cn2, groundAlt_m);

    // Scale to operating wavelength
    const r0Zenith_m = scaleWavelength(r0_500nm_m, wavelength_m);
    const theta0Zenith_rad = scaleWavelength(theta0_500nm_rad, wavelength_m);

    // Elevation correction
    const r0_m = r0ForElevation(r0Zenith_m, elevAngle_rad);
    const theta0_rad = theta0ForElevation(theta0Zenith_rad, elevAngle_rad);

    // Point-ahead angle
    const pointAhead_rad = computePointAhead(satAltitude_km);

    // Tilt isoplanatic angle: theta_TA = theta0 * (D / r0)
    // Ref: Sasiela & Shelton (1993)
    const tiltIsoplanatic_rad = theta0_rad * (D / r0_m);

    // Strehl ratios
    // S_TT = exp(-(theta_PA / theta_TA)^(5/3)) — conservative, ~30-50% uncertainty
    const tiltStrehl = Math.exp(-Math.pow(pointAhead_rad / tiltIsoplanatic_rad, 5.0 / 3.0));

    // S_HO = AO_IDEAL_STREHL * exp(-(theta_PA / theta0)^(5/3))
    const hoStrehl = AO_IDEAL_STREHL * Math.exp(-Math.pow(pointAhead_rad / theta0_rad, 5.0 / 3.0));

    // Effective spot decomposition (Gaussian 1/e^2 convention)
    const w0_m = D / 2;
    const zR = Math.PI * w0_m * w0_m / wavelength_m;

    // Diffraction-limited beam diameter at receiver
    const w_diff = w0_m * Math.sqrt(1 + (distance_m / zR) ** 2);
    const D_diff = 2 * w_diff;

    // Seeing-limited beam diameter (Gaussian convention)
    const D_seeing = 2 * wavelength_m * distance_m / (Math.PI * r0_m);

    // Noll decomposition
    const D_wander = Math.sqrt(NOLL_TILT_FRACTION) * D_seeing;
    const D_SE = Math.sqrt(NOLL_HO_FRACTION) * D_seeing;

    // Effective beam diameter combining diffraction, residual wander, and residual HO
    const D_eff_sq = D_diff ** 2
        + (1 - tiltStrehl) ** 2 * D_wander ** 2
        + (1 - hoStrehl) ** 2 * D_SE ** 2;
    const turbBeamDiameter_m = Math.sqrt(D_eff_sq);

    // Scintillation (scaled for station altitude)
    const scintillationLoss = computeScintillationLoss(wavelength_m, distance_m, _params.Cn2, groundAlt_m);

    return {
        turbBeamDiameter_m,
        scintillationLoss,
        r0_m,
        theta0_rad,
        pointAhead_rad,
        tiltIsoplanatic_rad,
        tiltStrehl,
        hoStrehl,
    };
}
