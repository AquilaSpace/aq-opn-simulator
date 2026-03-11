/**
 * passAnalyser.js — Compute power beaming pass statistics for ground-satellite pairs.
 * Uses the existing Keplerian propagator from orbitalMechanics.js and elevation
 * calculations from physics.js.
 *
 * Pure computation — no DOM dependencies.
 */

import { propagateOrbit, orbitalPeriod } from './orbitalMechanics.js';
import { computeElevationAngle, checkLineOfSight } from './physics.js';
import { latLonAltToScene, EARTH_RADIUS_KM, SCENE_SCALE_KM } from './constants.js';

/**
 * Compute pass statistics for a single ground station to satellite pair.
 *
 * Steps through 24 hours of propagation at a configurable time step, identifies
 * contiguous windows where the satellite is above the minimum elevation, and
 * returns aggregate statistics.
 *
 * @param {object} groundNode — node with position { lat_deg, lon_deg, alt_km }
 * @param {object} satNode — node with params.orbitalElements
 * @param {number} [minElevationDeg=45] — minimum elevation for beaming
 * @param {number} [simDurationHours=24] — analysis window
 * @param {number} [stepSeconds=10] — propagation time step
 * @returns {{ passesPerDay: number, avgUsableMinPerPass: number, maxElevPerPass: number[] }}
 */
export function computePassStats(groundNode, satNode, minElevationDeg = 45, simDurationHours = 24, stepSeconds = 10) {
    const oe = satNode.params?.orbitalElements;
    if (!oe) return { passesPerDay: 0, avgUsableMinPerPass: 0, maxElevPerPass: [] };

    const minElevRad = minElevationDeg * Math.PI / 180;
    const totalSteps = Math.floor((simDurationHours * 3600) / stepSeconds);

    // Ground station scene position (static — Earth does not rotate)
    const gPos = groundNode.scenePos || latLonAltToScene(
        groundNode.position.lat_deg,
        groundNode.position.lon_deg,
        groundNode.position.alt_km || 0,
    );

    const passes = [];
    let inPass = false;
    let passStart = 0;
    let passMaxElev = 0;

    for (let step = 0; step <= totalSteps; step++) {
        const t = step * stepSeconds;
        const satPos = propagateOrbit(oe, t);
        const elev = computeElevationAngle(gPos, satPos);
        const los = checkLineOfSight(gPos, satPos);

        if (elev >= minElevRad && los) {
            if (!inPass) {
                inPass = true;
                passStart = t;
                passMaxElev = elev;
            } else {
                passMaxElev = Math.max(passMaxElev, elev);
            }
        } else {
            if (inPass) {
                const duration = t - passStart;
                passes.push({
                    durationSec: duration,
                    maxElevRad: passMaxElev,
                });
                inPass = false;
            }
        }
    }

    // Close any open pass at the end of the window
    if (inPass) {
        const duration = (totalSteps * stepSeconds) - passStart;
        passes.push({
            durationSec: duration,
            maxElevRad: passMaxElev,
        });
    }

    const passesPerDay = passes.length * (24 / simDurationHours);
    const avgUsableMinPerPass = passes.length > 0
        ? passes.reduce((sum, p) => sum + p.durationSec, 0) / passes.length / 60
        : 0;
    const maxElevPerPass = passes.map(p => p.maxElevRad * 180 / Math.PI);

    return { passesPerDay, avgUsableMinPerPass, maxElevPerPass };
}

/**
 * Compute fleet-average pass statistics across all ground-satellite pairs.
 *
 * @param {Array} groundStations — array of ground source nodes
 * @param {Array} orbitalCustomers — array of orbital customer nodes
 * @param {number} [minElevationDeg=45]
 * @returns {{ avgPassesPerDayPerStation: number, avgUsableMinPerPass: number }}
 */
export function computeFleetPassStats(groundStations, orbitalCustomers, minElevationDeg = 45) {
    if (groundStations.length === 0 || orbitalCustomers.length === 0) {
        return { avgPassesPerDayPerStation: 0, avgUsableMinPerPass: 0 };
    }

    let totalPasses = 0;
    let totalMin = 0;
    let pairCount = 0;

    for (const gs of groundStations) {
        for (const sat of orbitalCustomers) {
            const stats = computePassStats(gs, sat, minElevationDeg);
            totalPasses += stats.passesPerDay;
            totalMin += stats.avgUsableMinPerPass * stats.passesPerDay;
            pairCount++;
        }
    }

    const avgPassesPerDayPerStation = pairCount > 0
        ? totalPasses / groundStations.length
        : 0;
    const totalPassCount = totalPasses;
    const avgUsableMinPerPass = totalPassCount > 0
        ? totalMin / totalPassCount
        : 0;

    return { avgPassesPerDayPerStation, avgUsableMinPerPass };
}
