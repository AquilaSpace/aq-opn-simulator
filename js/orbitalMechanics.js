/**
 * orbitalMechanics.js — Keplerian propagation with J2 perturbation,
 * orbital element <-> Cartesian conversion, orbit trail visualisation.
 *
 * Coordinate system: Three.js Y-up. Scene units = 1000 km.
 * ECI frame: X = vernal equinox, Z = north pole -> mapped to Three.js with Y-up:
 *   Three.js X = ECI Y, Three.js Y = ECI Z (north), Three.js Z = ECI X
 */

import * as THREE from 'three';
import { MU_EARTH, EARTH_RADIUS_KM, SCENE_SCALE_KM, deg2rad } from './constants.js';

/**
 * J2 zonal harmonic coefficient for Earth oblateness.
 * Causes RAAN drift and argument of perigee precession.
 */
const J2 = 1.08263e-3;

/**
 * Propagate a Keplerian orbit with J2 secular perturbations.
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
    const p = a * (1 - e * e); // semi-latus rectum in km

    // Mean motion (rad/s)
    const n = Math.sqrt(MU_EARTH / (a * a * a));

    // J2 secular perturbation rates
    const Re_over_p = EARTH_RADIUS_KM / p;
    const cosI = Math.cos(i);
    const sinI = Math.sin(i);

    // RAAN drift rate (rad/s)
    const raanDot = -1.5 * n * J2 * Re_over_p * Re_over_p * cosI;

    // Argument of perigee precession rate (rad/s)
    const aopDot = 0.75 * n * J2 * Re_over_p * Re_over_p * (5 * cosI * cosI - 1);

    // Perturbed RAAN and AoP
    const raan = deg2rad(oe.raan_deg) + raanDot * dt_s;
    const aop = deg2rad(oe.argOfPerigee_deg) + aopDot * dt_s;

    // Initial mean anomaly from initial true anomaly
    const nu0 = deg2rad(oe.trueAnomaly_deg);
    const E0 = trueToEccentric(nu0, e);
    const M0 = E0 - e * Math.sin(E0);

    // Propagate mean anomaly
    let M = M0 + n * dt_s;
    // Normalise to [0, 2pi]
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
    const cosI2 = Math.cos(i);
    const sinI2 = Math.sin(i);

    // ECI coordinates (X, Y, Z) where Z = north
    const eciX = (cosRaan * cosAop - sinRaan * sinAop * cosI2) * pX
               + (-cosRaan * sinAop - sinRaan * cosAop * cosI2) * pY;
    const eciY = (sinRaan * cosAop + cosRaan * sinAop * cosI2) * pX
               + (-sinRaan * sinAop + cosRaan * cosAop * cosI2) * pY;
    const eciZ = (sinAop * sinI2) * pX + (cosAop * sinI2) * pY;

    // Convert ECI -> Three.js scene coords
    // ECI Z (north) -> Three.js Y (up)
    // ECI X -> Three.js Z
    // ECI Y -> Three.js X
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
 * @param {number} [dt_s] — time offset (propagation includes J2 from this point)
 * @returns {Array<{x: number, y: number, z: number}>} scene coordinates
 */
export function generateOrbitPath(oe, numPoints = 120, dt_s = 0) {
    const period = orbitalPeriod(oe.semiMajorAxis_km);
    const points = [];
    for (let j = 0; j <= numPoints; j++) {
        const t = dt_s + (j / numPoints) * period;
        points.push(propagateOrbit(oe, t));
    }
    return points;
}

// ---------------------------------------------------------------------------
// Orbit trail rendering
// ---------------------------------------------------------------------------

/** @type {Map<string, THREE.Line>} nodeId -> orbit trail line */
const _orbitTrails = new Map();

/** Scene reference */
let _trailScene = null;

/**
 * Initialise orbit trail rendering.
 * @param {THREE.Scene} scene
 */
export function initOrbitTrails(scene) {
    _trailScene = scene;
}

/**
 * Update or create the orbit trail for an orbital node.
 * @param {string} nodeId
 * @param {object} oe — orbital elements
 * @param {number} simTime — current simulation time in seconds
 * @param {number} colour — hex colour for the trail
 */
export function updateOrbitTrail(nodeId, oe, simTime, colour = 0x4488ff) {
    if (!_trailScene) return;

    const pathPoints = generateOrbitPath(oe, 180, simTime);
    const vectors = pathPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));

    let trail = _orbitTrails.get(nodeId);
    if (trail) {
        trail.geometry.dispose();
        trail.geometry = new THREE.BufferGeometry().setFromPoints(vectors);
        trail.material.color.setHex(colour);
    } else {
        const geometry = new THREE.BufferGeometry().setFromPoints(vectors);
        const material = new THREE.LineBasicMaterial({
            color: colour,
            transparent: true,
            opacity: 0.25,
            linewidth: 1,
            depthWrite: false,
        });
        trail = new THREE.Line(geometry, material);
        trail.name = 'orbit-trail-' + nodeId;
        trail.renderOrder = -1;
        _trailScene.add(trail);
        _orbitTrails.set(nodeId, trail);
    }
}

/**
 * Remove an orbit trail.
 * @param {string} nodeId
 */
export function removeOrbitTrail(nodeId) {
    const trail = _orbitTrails.get(nodeId);
    if (trail && _trailScene) {
        _trailScene.remove(trail);
        trail.geometry.dispose();
        trail.material.dispose();
        _orbitTrails.delete(nodeId);
    }
}

/**
 * Clear all orbit trails.
 */
export function clearAllOrbitTrails() {
    for (const id of Array.from(_orbitTrails.keys())) {
        removeOrbitTrail(id);
    }
}
