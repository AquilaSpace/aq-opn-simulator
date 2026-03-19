/**
 * optimiser.js — Greedy/heuristic relay placement engine.
 * Suggests relay positions to connect sources to customers with positive link margin.
 */

import * as THREE from 'three';
import {
    EARTH_RADIUS_KM, EARTH_RADIUS, SCENE_SCALE_KM,
    latLonAltToScene, sceneToLatLonAlt,
} from './constants.js';
import { getAllNodes, getNode, createNode } from './nodeManager.js';
import {
    computeLinkBudget,
    computeAtmosphericTransmission,
    computeElevationAngle,
    computeDistance_km,
    checkLineOfSight,
    getAltitude_km,
} from './physics.js';
import { getBeamTypeKey, getAtmConditionKey, createLink } from './linkManager.js';
import { BEAM_TYPES } from './constants.js';

/**
 * @typedef {object} RelaySuggestion
 * @property {string} type — node type
 * @property {object} position — { lat_deg, lon_deg, alt_km } or scene coords
 * @property {string} reason — why this relay is suggested
 * @property {string} sourceId — connects from
 * @property {string} customerId — connects to
 */

/**
 * Auto-suggest relay placements to connect sources to customers.
 *
 * @param {object} opts
 * @param {number} [opts.maxRelays=5]       — maximum relays to suggest
 * @param {number} [opts.minMargin_dB=3]    — minimum acceptable link margin
 * @param {number} [opts.maxAltitude_km=42164] — max relay altitude
 * @returns {RelaySuggestion[]}
 */
export function autoSuggestRelays(opts = {}) {
    const {
        maxRelays = 5,
        minMargin_dB = 3,
        maxAltitude_km = 42164,
    } = opts;

    const nodes = getAllNodes();
    const sources = nodes.filter(n => n.type === 'GROUND_SOURCE');
    const customers = nodes.filter(n =>
        n.type === 'GROUND_CUSTOMER' || n.type === 'LUNAR_NODE'
    );

    if (sources.length === 0 || customers.length === 0) return [];

    const beamKey = getBeamTypeKey();
    const atmKey = getAtmConditionKey();
    const beam = BEAM_TYPES[beamKey];
    const wavelength_m = beam ? beam.wavelength_m : 1080e-9;

    const suggestions = [];

    for (const customer of customers) {
        // Check if any source can reach this customer directly
        let directReachable = false;
        let bestSource = null;
        let bestMargin = -Infinity;

        for (const source of sources) {
            const margin = _quickMarginCheck(source, customer, wavelength_m, beamKey, atmKey);
            if (margin > bestMargin) {
                bestMargin = margin;
                bestSource = source;
            }
            if (margin >= minMargin_dB) {
                directReachable = true;
                break;
            }
        }

        if (directReachable) continue;

        // Need a relay. Try midpoint ground relay first.
        if (bestSource) {
            const midpoint = _computeMidpoint(bestSource.scenePos, customer.scenePos);
            const midLatLon = sceneToLatLonAlt(midpoint.x, midpoint.y, midpoint.z);

            // Check if ground relay at midpoint works
            const groundRelayPos = latLonAltToScene(midLatLon.lat_deg, midLatLon.lon_deg, 0);
            const margin1 = _quickMarginCheckPos(bestSource, groundRelayPos, wavelength_m, beamKey, atmKey);
            const margin2 = _quickMarginCheckPos2(groundRelayPos, customer, wavelength_m, beamKey, atmKey);

            if (margin1 >= minMargin_dB && margin2 >= minMargin_dB) {
                suggestions.push({
                    type: 'GROUND_RELAY',
                    position: { lat_deg: midLatLon.lat_deg, lon_deg: midLatLon.lon_deg, alt_km: 0 },
                    reason: `Ground relay between ${bestSource.name} and ${customer.name}`,
                    sourceId: bestSource.id,
                    customerId: customer.id,
                });
                continue;
            }

            // Try orbital relay (ground→space→ground)
            // Place at GEO altitude above midpoint longitude
            const orbAlt_km = Math.min(35786, maxAltitude_km); // GEO
            const orbPos = latLonAltToScene(0, midLatLon.lon_deg, orbAlt_km);
            const margin1o = _quickMarginCheckPos(bestSource, orbPos, wavelength_m, beamKey, atmKey);
            const margin2o = _quickMarginCheckPos2(orbPos, customer, wavelength_m, beamKey, atmKey);

            if (margin1o >= minMargin_dB && margin2o >= minMargin_dB) {
                suggestions.push({
                    type: 'ORBITAL_RELAY',
                    position: { lat_deg: 0, lon_deg: midLatLon.lon_deg, alt_km: orbAlt_km },
                    reason: `Orbital relay for ${bestSource.name} → ${customer.name}`,
                    sourceId: bestSource.id,
                    customerId: customer.id,
                    orbitalElements: {
                        semiMajorAxis_km: EARTH_RADIUS_KM + orbAlt_km,
                        eccentricity: 0,
                        inclination_deg: 0,
                        raan_deg: 0,
                        argOfPerigee_deg: 0,
                        trueAnomaly_deg: midLatLon.lon_deg,
                    },
                });
                continue;
            }

            // Fallback: suggest a relay at midpoint anyway
            suggestions.push({
                type: 'GROUND_RELAY',
                position: { lat_deg: midLatLon.lat_deg, lon_deg: midLatLon.lon_deg, alt_km: 0 },
                reason: `Best-effort relay for ${customer.name} (margin may be insufficient)`,
                sourceId: bestSource.id,
                customerId: customer.id,
            });
        }

        if (suggestions.length >= maxRelays) break;
    }

    return suggestions.slice(0, maxRelays);
}

/**
 * Accept a suggestion: create the node and links.
 * @param {RelaySuggestion} suggestion
 */
export function acceptSuggestion(suggestion) {
    const params = {};
    if (suggestion.orbitalElements) {
        params.orbitalElements = suggestion.orbitalElements;
    }
    const node = createNode({
        type: suggestion.type,
        position: suggestion.position,
        params,
    });

    // Create links
    if (suggestion.sourceId) {
        createLink(suggestion.sourceId, node.id);
    }
    if (suggestion.customerId) {
        createLink(node.id, suggestion.customerId);
    }

    return node;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _quickMarginCheck(source, target, wavelength_m, beamKey, atmKey) {
    const p2 = target.scenePos;
    return _quickMarginCheckPos(source, p2, wavelength_m, beamKey, atmKey);
}

function _quickMarginCheckPos(source, targetPos, wavelength_m, beamKey, atmKey) {
    const p1 = source.scenePos;
    const distance_km = computeDistance_km(p1, targetPos);
    const distance_m = distance_km * 1000;

    if (!checkLineOfSight(p1, targetPos)) return -100;

    const alt1 = getAltitude_km(p1);
    const alt2 = getAltitude_km(targetPos);
    const elev = computeElevationAngle(
        alt1 < alt2 ? p1 : targetPos,
        alt1 < alt2 ? targetPos : p1
    );
    const atmLoss = computeAtmosphericTransmission(alt1, alt2, elev, beamKey, atmKey);

    const txPower_W = (source.params.transmitPower_kW || 10) * 1000;
    const txAp = source.params.apertureDiameter_m || 0.3;
    const rxAp = 0.3; // Assume default

    const budget = computeLinkBudget({
        txPower_W,
        txEfficiency: source.params.transmitterEfficiency || 0.85,
        txApertureDiameter_m: txAp,
        rxApertureDiameter_m: rxAp,
        distance_m,
        wavelength_m,
        txPointingJitter_rad: (source.params.trackingAccuracy_mrad || 0.1) * 1e-3,
        atmosphericLoss: atmLoss,
    });

    return budget.rxPower_dBW - (10 * Math.log10(txPower_W)); // Simplified margin
}

function _quickMarginCheckPos2(fromPos, target, wavelength_m, beamKey, atmKey) {
    const distance_km = computeDistance_km(fromPos, target.scenePos);
    const distance_m = distance_km * 1000;

    if (!checkLineOfSight(fromPos, target.scenePos)) return -100;

    const alt1 = getAltitude_km(fromPos);
    const alt2 = getAltitude_km(target.scenePos);
    const elev = computeElevationAngle(
        alt1 < alt2 ? fromPos : target.scenePos,
        alt1 < alt2 ? target.scenePos : fromPos
    );
    const atmLoss = computeAtmosphericTransmission(alt1, alt2, elev, beamKey, atmKey);

    const budget = computeLinkBudget({
        txPower_W: 30000, // Default relay power
        txEfficiency: 0.80,
        txApertureDiameter_m: 0.3,
        rxApertureDiameter_m: target.params.apertureDiameter_m || 0.3,
        distance_m,
        wavelength_m,
        txPointingJitter_rad: 0.1e-3,
        atmosphericLoss: atmLoss,
    });

    const reqPower_W = (target.params.requiredPower_kW || 10) * 1000;
    return budget.rxPower_dBW - 10 * Math.log10(reqPower_W);
}

function _computeMidpoint(p1, p2) {
    // Midpoint on Earth surface (great circle)
    const v1 = new THREE.Vector3(p1.x, p1.y, p1.z).normalize();
    const v2 = new THREE.Vector3(p2.x, p2.y, p2.z).normalize();
    const mid = new THREE.Vector3().addVectors(v1, v2).normalize();
    mid.multiplyScalar(EARTH_RADIUS);
    return { x: mid.x, y: mid.y, z: mid.z };
}
