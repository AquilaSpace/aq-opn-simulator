/**
 * orbitalMechanics.js — Keplerian propagation, orbital element ↔ Cartesian conversion,
 * epoch/time handling.
 *
 * Coordinate system: Three.js Y-up. Scene units = 1000 km.
 * ECI frame: X = vernal equinox, Z = north pole → mapped to Three.js with Y-up:
 *   Three.js X = ECI X, Three.js Y = ECI Z (north), Three.js Z = -ECI Y
 *   (or equivalently: right-hand rule with Y up)
 */

import { MU_EARTH, SCENE_SCALE_KM, deg2rad } from './constants.js';

/**
 * Propagate a Keplerian orbit from given elements and time offset.
 *
 * @param {object} oe — orbital elements
 * @param {number} oe.semiMajorAxis_km
 * @param {number} oe.eccentricity
 * @param {number} oe.inclination_deg
 * @param {number} oe.raan_deg          — right ascension of ascending node
 * @param {number} oe.argOfPerigee_deg
 * @param {number} oe.trueAnomaly_deg   — initial true anomaly at epoch
 * @param {number} dt_s — time since epoch in seconds
 * @returns {{ x: number, y: number, z: number }} scene coordinates
 */
export function propagateOrbit(oe, dt_s) {
    const a = oe.semiMajorAxis_km;
    const e = oe.eccentricity;
    const i = deg2rad(oe.inclination_deg);
    const raan = deg2rad(oe.raan_deg);
    const aop = deg2rad(oe.argOfPerigee_deg);

    // Mean motion (rad/s)
    const n = Math.sqrt(MU_EARTH / (a * a * a));

    // Initial mean anomaly from initial true anomaly
    const nu0 = deg2rad(oe.trueAnomaly_deg);
    const E0 = trueToEccentric(nu0, e);
    const M0 = E0 - e * Math.sin(E0);

    // Propagate mean anomaly
    let M = M0 + n * dt_s;
    // Normalise to [0, 2π]
    M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    // Solve Kepler's equation: M = E - e*sin(E)
    const E = solveKepler(M, e);

    // True anomaly
    const nu = eccentricToTrue(E, e);

    // Distance
    const r = a * (1 - e * Math.cos(E));

    // Position in perifocal frame (PQW)
    const cosNu = Math.cos(nu);
    const sinNu = Math.sin(nu);
    const pX = r * cosNu;
    const pY = r * sinNu;

    // Rotation to ECI
    const cosRaan = Math.cos(raan);
    const sinRaan = Math.sin(raan);
    const cosAop = Math.cos(aop);
    const sinAop = Math.sin(aop);
    const cosI = Math.cos(i);
    const sinI = Math.sin(i);

    // ECI coordinates (X, Y, Z) where Z = north
    const eciX = (cosRaan * cosAop - sinRaan * sinAop * cosI) * pX
               + (-cosRaan * sinAop - sinRaan * cosAop * cosI) * pY;
    const eciY = (sinRaan * cosAop + cosRaan * sinAop * cosI) * pX
               + (-sinRaan * sinAop + cosRaan * cosAop * cosI) * pY;
    const eciZ = (sinAop * sinI) * pX + (cosAop * sinI) * pY;

    // Convert ECI → Three.js scene coords
    // ECI Z (north) → Three.js Y (up)
    // ECI X → Three.js Z
    // ECI Y → Three.js X
    const sceneX = eciY / SCENE_SCALE_KM;
    const sceneY = eciZ / SCENE_SCALE_KM;
    const sceneZ = eciX / SCENE_SCALE_KM;

    return { x: sceneX, y: sceneY, z: sceneZ };
}

/**
 * Solve Kepler's equation M = E - e*sin(E) using Newton-Raphson.
 * @param {number} M — mean anomaly (rad)
 * @param {number} e — eccentricity
 * @returns {number} eccentric anomaly (rad)
 */
export function solveKepler(M, e) {
    let E = M; // Initial guess
    for (let iter = 0; iter < 30; iter++) {
        const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        E -= dE;
        if (Math.abs(dE) < 1e-12) break;
    }
    return E;
}

/**
 * Convert true anomaly to eccentric anomaly.
 */
export function trueToEccentric(nu, e) {
    return Math.atan2(
        Math.sqrt(1 - e * e) * Math.sin(nu),
        e + Math.cos(nu)
    );
}

/**
 * Convert eccentric anomaly to true anomaly.
 */
export function eccentricToTrue(E, e) {
    return Math.atan2(
        Math.sqrt(1 - e * e) * Math.sin(E),
        Math.cos(E) - e
    );
}

/**
 * Compute the orbital period for a given semi-major axis.
 * @param {number} a_km — semi-major axis in km
 * @returns {number} period in seconds
 */
export function orbitalPeriod(a_km) {
    return 2 * Math.PI * Math.sqrt(a_km * a_km * a_km / MU_EARTH);
}

/**
 * Generate an array of points along an orbit for visualisation.
 * @param {object} oe — orbital elements
 * @param {number} numPoints — number of points
 * @returns {Array<{x: number, y: number, z: number}>} scene coordinates
 */
export function generateOrbitPath(oe, numPoints = 120) {
    const period = orbitalPeriod(oe.semiMajorAxis_km);
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
        const dt = (i / numPoints) * period;
        points.push(propagateOrbit(oe, dt));
    }
    return points;
}
