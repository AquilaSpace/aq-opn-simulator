/**
 * physics.js — Pure calculation engine for link budgets, attenuation, beam divergence, LOS.
 * Zero DOM dependencies. Only imports from constants.js.
 *
 * All calculations in SI units internally: W, m, rad, km.
 */

import {
    EARTH_RADIUS_KM, MOON_RADIUS_KM, MOON_DISTANCE_KM,
    ATMOSPHERE_SCALE_HEIGHT_KM, KARMAN_LINE_KM,
    BEAM_TYPES, ATMOSPHERIC_CONDITIONS, SCENE_SCALE_KM,
} from './constants.js';

// ---------------------------------------------------------------------------
// Beam propagation (aperture-to-aperture model)
// ---------------------------------------------------------------------------

/**
 * Compute the full link budget between two nodes.
 *
 * @param {object} opts
 * @param {number} opts.txPower_W              — transmit power in watts
 * @param {number} opts.txEfficiency            — transmitter efficiency (0–1)
 * @param {number} opts.txApertureDiameter_m    — transmit aperture diameter in metres
 * @param {number} opts.rxApertureDiameter_m    — receive aperture diameter in metres
 * @param {number} opts.distance_m              — link distance in metres
 * @param {number} opts.wavelength_m            — beam wavelength in metres
 * @param {number} [opts.divergenceHalfAngle_rad] — override divergence (if null, diffraction-limited)
 * @param {number} [opts.txPointingJitter_rad]  — transmitter pointing jitter (1-sigma, rad)
 * @param {number} opts.atmosphericLoss         — atmospheric transmission factor (0–1)
 * @returns {object} link budget breakdown
 */
export function computeLinkBudget(opts) {
    const {
        txPower_W,
        txEfficiency,
        txApertureDiameter_m,
        rxApertureDiameter_m,
        distance_m,
        wavelength_m,
        txPointingJitter_rad = 0,
        atmosphericLoss = 1.0,
    } = opts;

    // Gaussian beam model: beam waist = aperture radius, propagated to receiver distance.
    // Far-field 1/e² divergence half-angle: θ = λ / (π w₀)
    const w0_m = txApertureDiameter_m / 2; // beam waist radius
    const divergence_rad = opts.divergenceHalfAngle_rad
        || (wavelength_m / (Math.PI * w0_m));

    // Beam 1/e² radius at receiver: w(z) = w₀ √(1 + (z/z_R)²)
    const rayleighRange_m = Math.PI * w0_m * w0_m / wavelength_m;
    const wAtRx_m = w0_m * Math.sqrt(1 + (distance_m / rayleighRange_m) ** 2);

    // Beam 1/e² diameter at receiver (for display)
    const beamDiameterAtRx_m = 2 * wAtRx_m;

    // Gaussian capture fraction: η = 1 − exp(−2 (r_rx / w)²)
    const rxRadius_m = rxApertureDiameter_m / 2;
    const rxCaptureFraction = Math.min(1.0,
        1 - Math.exp(-2 * (rxRadius_m / wAtRx_m) ** 2)
    );

    // Pointing loss: exp(-2 * (sigma_pointing / theta_div)^2)
    const pointingLoss = divergence_rad > 0
        ? Math.exp(-2 * Math.pow(txPointingJitter_rad / divergence_rad, 2))
        : 1.0;

    // Received power
    const rxPower_W = txPower_W * txEfficiency * rxCaptureFraction * pointingLoss * atmosphericLoss;

    // dB values
    const txPower_dBW = 10 * Math.log10(Math.max(txPower_W, 1e-30));
    const rxPower_dBW = 10 * Math.log10(Math.max(rxPower_W, 1e-30));
    const captureLoss_dB = 10 * Math.log10(Math.max(rxCaptureFraction, 1e-30));
    const pointingLoss_dB = 10 * Math.log10(Math.max(pointingLoss, 1e-30));
    const atmosphericLoss_dB = 10 * Math.log10(Math.max(atmosphericLoss, 1e-30));
    const efficiencyLoss_dB = 10 * Math.log10(Math.max(txEfficiency, 1e-30));

    return {
        txPower_W,
        txPower_kW: txPower_W / 1000,
        txPower_dBW,
        txEfficiency,
        efficiencyLoss_dB,
        wavelength_m,
        wavelength_nm: wavelength_m * 1e9,
        distance_m,
        distance_km: distance_m / 1000,
        divergence_rad,
        divergence_mrad: divergence_rad * 1000,
        beamDiameterAtRx_m,
        txApertureDiameter_m,
        rxApertureDiameter_m,
        rxCaptureFraction,
        captureLoss_dB,
        pointingLoss,
        pointingLoss_dB,
        atmosphericLoss,
        atmosphericLoss_dB,
        rxPower_W,
        rxPower_kW: rxPower_W / 1000,
        rxPower_dBW,
        totalPathLoss_dB: txPower_dBW - rxPower_dBW, // positive value = loss
    };
}

// ---------------------------------------------------------------------------
// Atmospheric attenuation
// ---------------------------------------------------------------------------

/**
 * Compute atmospheric transmission factor for a slant path between two altitudes.
 *
 * @param {number} alt1_km       — altitude of endpoint 1 in km
 * @param {number} alt2_km       — altitude of endpoint 2 in km
 * @param {number} elevAngle_rad — elevation angle of the link above local horizon
 * @param {number} extinction_dBpkm — extinction coefficient at sea level (dB/km)
 * @returns {number} atmospheric transmission factor (0–1)
 */
export function computeAtmosphericTransmission(alt1_km, alt2_km, elevAngle_rad, extinction_dBpkm) {
    // If both endpoints above Karman line, no atmospheric loss
    if (alt1_km >= KARMAN_LINE_KM && alt2_km >= KARMAN_LINE_KM) {
        return 1.0;
    }

    const H = ATMOSPHERE_SCALE_HEIGHT_KM;

    // Effective path length through atmosphere using scale height model
    const sinEl = Math.max(Math.sin(elevAngle_rad), 0.01); // Avoid division by zero

    const h1 = Math.max(alt1_km, 0);
    const h2 = Math.max(alt2_km, 0);

    // Effective path length: integral of density along slant path
    // L_eff = H / sin(el) * (exp(-h_low/H) - exp(-h_high/H))
    const hLow = Math.min(h1, h2);
    const hHigh = Math.min(Math.max(h1, h2), KARMAN_LINE_KM);

    const effectivePathLength_km = (H / sinEl) * (Math.exp(-hLow / H) - Math.exp(-hHigh / H));

    // Total atmospheric loss
    const totalLoss_dB = extinction_dBpkm * effectivePathLength_km;
    const transmission = Math.pow(10, -totalLoss_dB / 10);

    return Math.max(0, Math.min(1, transmission));
}

/**
 * Compute the elevation angle of a link above the local horizon at a ground station.
 *
 * @param {object} groundPos — { x, y, z } in scene units (Earth-centred)
 * @param {object} targetPos — { x, y, z } in scene units
 * @returns {number} elevation angle in radians
 */
export function computeElevationAngle(groundPos, targetPos) {
    // Local "up" at ground position is the normalised ground position vector
    const gx = groundPos.x, gy = groundPos.y, gz = groundPos.z;
    const gLen = Math.sqrt(gx * gx + gy * gy + gz * gz);
    const upX = gx / gLen, upY = gy / gLen, upZ = gz / gLen;

    // Vector from ground to target
    const dx = targetPos.x - gx;
    const dy = targetPos.y - gy;
    const dz = targetPos.z - gz;
    const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dLen === 0) return Math.PI / 2;

    // Elevation = arcsin(dot(up, direction_to_target))
    const dot = (upX * dx + upY * dy + upZ * dz) / dLen;
    return Math.asin(Math.max(-1, Math.min(1, dot)));
}

// ---------------------------------------------------------------------------
// Line-of-sight check
// ---------------------------------------------------------------------------

/**
 * Check if the line segment between two points in scene coordinates
 * intersects the Earth sphere.
 *
 * @param {object} p1 — { x, y, z } scene coords
 * @param {object} p2 — { x, y, z } scene coords
 * @returns {boolean} true if line of sight is clear (no intersection)
 */
export function checkLineOfSight(p1, p2) {
    return _checkLOSAgainstSphere(p1, p2, { x: 0, y: 0, z: 0 }, EARTH_RADIUS_KM / SCENE_SCALE_KM);
}

/**
 * Check if the line segment intersects the Moon sphere.
 *
 * @param {object} p1 — { x, y, z } scene coords
 * @param {object} p2 — { x, y, z } scene coords
 * @param {object} moonPos — { x, y, z } Moon centre in scene coords
 * @returns {boolean} true if line of sight is clear
 */
export function checkLineOfSightMoon(p1, p2, moonPos) {
    return _checkLOSAgainstSphere(p1, p2, moonPos, MOON_RADIUS_KM / SCENE_SCALE_KM);
}

/**
 * Ray-sphere intersection test for LOS.
 * Returns true if the segment does NOT intersect the sphere.
 */
function _checkLOSAgainstSphere(p1, p2, centre, radius) {
    // Direction vector
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;

    // Vector from p1 to sphere centre
    const fx = p1.x - centre.x;
    const fy = p1.y - centre.y;
    const fz = p1.z - centre.z;

    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (fx * dx + fy * dy + fz * dz);
    const c = fx * fx + fy * fy + fz * fz - radius * radius;

    let discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return true; // No intersection

    discriminant = Math.sqrt(discriminant);
    const t1 = (-b - discriminant) / (2 * a);
    const t2 = (-b + discriminant) / (2 * a);

    // Check if intersection is within the segment [0, 1]
    // Use a small margin to allow endpoints on the surface
    const margin = 0.001;
    if ((t1 > margin && t1 < 1 - margin) || (t2 > margin && t2 < 1 - margin)) {
        return false; // LOS blocked
    }

    // Also blocked if the segment passes through the sphere
    if (t1 < margin && t2 > 1 - margin) {
        return false;
    }

    return true; // LOS clear
}

/**
 * Compute 3D distance between two scene positions in km.
 *
 * @param {object} p1 — { x, y, z } scene coords
 * @param {object} p2 — { x, y, z } scene coords
 * @returns {number} distance in km
 */
export function computeDistance_km(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) * SCENE_SCALE_KM;
}

/**
 * Get altitude of a scene position above Earth surface, in km.
 */
export function getAltitude_km(pos) {
    const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    return r * SCENE_SCALE_KM - EARTH_RADIUS_KM;
}

/**
 * Get the extinction coefficient for a given beam type key and atmospheric condition key.
 *
 * @param {string} beamTypeKey — key from BEAM_TYPES (e.g. 'YB_FIBRE')
 * @param {string} conditionKey — key from ATMOSPHERIC_CONDITIONS (e.g. 'clear')
 * @returns {number} extinction in dB/km
 */
export function getExtinction(beamTypeKey, conditionKey) {
    const beam = BEAM_TYPES[beamTypeKey];
    const cond = ATMOSPHERIC_CONDITIONS[conditionKey];
    if (!beam || !cond) return 0.2; // Fallback
    return beam[cond.key] || 0.2;
}
