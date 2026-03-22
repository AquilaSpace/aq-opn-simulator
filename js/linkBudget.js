/**
 * linkBudget.js — Per-link budget calculations. Calls physics.js, formats results for UI.
 */

import {
    computeLinkBudget,
    computeAtmosphericTransmission,
    computeElevationAngle,
    computeDistance_km,
    checkLineOfSight,
    getAltitude_km,
} from './physics.js';
import { getNode } from './nodeManager.js';
import { BEAM_TYPES, MARGINAL_THRESHOLD_DB } from './constants.js';
import { computeTurbulenceCorrection, isTurbulenceEnabled } from './turbulenceModel.js';

/**
 * Compute the full link budget for a link between two nodes.
 *
 * @param {object} link        — link data { fromId, toId, wavelength_nm, ... }
 * @param {string} beamTypeKey — global beam type key (e.g. 'YB_FIBRE')
 * @param {string} atmCondKey  — atmospheric condition key (e.g. 'clear')
 * @returns {object|null} budget result, or null if nodes missing
 */
export function computeFullLinkBudget(link, beamTypeKey, atmCondKey) {
    const fromNode = getNode(link.fromId);
    const toNode = getNode(link.toId);
    if (!fromNode || !toNode) return null;

    // Determine wavelength: per-link override or global
    let wavelength_m;
    let effectiveBeamKey = beamTypeKey;
    if (link.wavelength_nm) {
        wavelength_m = link.wavelength_nm * 1e-9;
        // Find matching beam type for extinction
        for (const [k, v] of Object.entries(BEAM_TYPES)) {
            if (v.wavelength_nm === link.wavelength_nm) {
                effectiveBeamKey = k;
                break;
            }
        }
    } else {
        const beam = BEAM_TYPES[beamTypeKey];
        wavelength_m = beam ? beam.wavelength_m : 1080e-9;
    }

    // Positions in scene coordinates
    const p1 = fromNode.scenePos;
    const p2 = toNode.scenePos;

    // Distance
    const distance_km = computeDistance_km(p1, p2);
    const distance_m = distance_km * 1000;

    // Line of sight
    const losOk = checkLineOfSight(p1, p2);

    // Altitudes
    const alt1_km = getAltitude_km(p1);
    const alt2_km = getAltitude_km(p2);

    // Elevation angle (from the lower endpoint)
    const lowerPos = alt1_km < alt2_km ? p1 : p2;
    const higherPos = alt1_km < alt2_km ? p2 : p1;
    const elevAngle_rad = computeElevationAngle(lowerPos, higherPos);

    // Atmospheric attenuation (zenith-transmittance + optical scale height model)
    const atmTransmission = computeAtmosphericTransmission(alt1_km, alt2_km, elevAngle_rad, effectiveBeamKey, atmCondKey);

    // Node parameters
    const txPower_kW = fromNode.params.transmitPower_kW || 0;
    const txPower_W = txPower_kW * 1000;
    const txEfficiency = fromNode.params.transmitterEfficiency || 0.95;
    const txAperture = fromNode.params.apertureDiameter_m || 0.3;
    const rxAperture = toNode.params.receiveAperture_m || toNode.params.apertureDiameter_m || 0.3;
    const trackingJitter_rad = (fromNode.params.trackingAccuracy_mrad || 0.1) * 1e-3;

    // Turbulence correction (only for ground-to-space links when enabled)
    const turbCorr = computeTurbulenceCorrection({
        wavelength_m,
        distance_m,
        txApertureDiameter_m: txAperture,
        alt1_km,
        alt2_km,
        elevAngle_rad,
        satAltitude_km: Math.max(alt1_km, alt2_km),
    });

    // Compute base budget (diffraction-limited Gaussian beam)
    const budget = computeLinkBudget({
        txPower_W,
        txEfficiency,
        txApertureDiameter_m: txAperture,
        rxApertureDiameter_m: rxAperture,
        distance_m,
        wavelength_m,
        txPointingJitter_rad: trackingJitter_rad,
        atmosphericLoss: atmTransmission,
    });

    // Apply turbulence corrections if active for this link
    let turbulenceApplied = false;
    let turbBeamDiameter_m = null;
    let scintillationLoss = 1.0;
    let scintillationLoss_dB = 0;
    let r0_m = null;
    let theta0_rad = null;
    let pointAhead_rad = null;
    let tiltIsoplanatic_rad = null;
    let tiltStrehl = null;
    let hoStrehl = null;

    if (turbCorr) {
        turbulenceApplied = true;
        turbBeamDiameter_m = turbCorr.turbBeamDiameter_m;
        scintillationLoss = turbCorr.scintillationLoss;
        scintillationLoss_dB = 10 * Math.log10(Math.max(scintillationLoss, 1e-30));
        r0_m = turbCorr.r0_m;
        theta0_rad = turbCorr.theta0_rad;
        pointAhead_rad = turbCorr.pointAhead_rad;
        tiltIsoplanatic_rad = turbCorr.tiltIsoplanatic_rad;
        tiltStrehl = turbCorr.tiltStrehl;
        hoStrehl = turbCorr.hoStrehl;

        // Recompute capture fraction with turbulence-broadened beam
        const wTurb_m = turbBeamDiameter_m / 2; // beam radius
        const rxRadius_m = rxAperture / 2;
        const turbCapture = Math.min(1.0,
            1 - Math.exp(-2 * (rxRadius_m / wTurb_m) ** 2),
        );
        const turbCapture_dB = 10 * Math.log10(Math.max(turbCapture, 1e-30));

        // Recalculate received power with turbulence
        const rxPower_W = txPower_W * txEfficiency * turbCapture
            * budget.pointingLoss * atmTransmission * scintillationLoss;
        const rxPower_dBW = 10 * Math.log10(Math.max(rxPower_W, 1e-30));

        // Overwrite budget fields with turbulence-corrected values
        budget.beamDiameterAtRx_m = turbBeamDiameter_m;
        budget.rxCaptureFraction = turbCapture;
        budget.captureLoss_dB = turbCapture_dB;
        budget.rxPower_W = rxPower_W;
        budget.rxPower_kW = rxPower_W / 1000;
        budget.rxPower_dBW = rxPower_dBW;
        budget.totalPathLoss_dB = budget.txPower_dBW - rxPower_dBW;
        budget.overallEfficiency = txPower_W > 0 ? rxPower_W / txPower_W : 0;
    }

    // Required power (from receiver node)
    const requiredPower_kW = toNode.params.requiredPower_kW || 0;
    const requiredPower_dBW = requiredPower_kW > 0
        ? 10 * Math.log10(requiredPower_kW * 1000)
        : -Infinity;

    // Link margin relative to required power
    const marginOverRequired_dB = requiredPower_kW > 0
        ? budget.rxPower_dBW - requiredPower_dBW
        : Infinity; // No requirement → always sufficient

    // Status classification
    let status;
    if (!losOk) {
        status = 'BROKEN';
    } else if (txPower_kW <= 0) {
        status = 'INACTIVE';
    } else if (requiredPower_kW > 0 && marginOverRequired_dB < 0) {
        status = 'BROKEN';
    } else if (requiredPower_kW > 0 && marginOverRequired_dB < MARGINAL_THRESHOLD_DB) {
        status = 'MARGINAL';
    } else {
        status = 'ACTIVE';
    }

    return {
        ...budget,
        losOk,
        alt1_km,
        alt2_km,
        elevAngle_rad,
        elevAngle_deg: elevAngle_rad * 180 / Math.PI,
        requiredPower_kW,
        requiredPower_dBW,
        marginOverRequired_dB,
        status,
        // Turbulence fields
        turbulenceApplied,
        turbBeamDiameter_m,
        scintillationLoss,
        scintillationLoss_dB,
        r0_m,
        theta0_rad,
        pointAhead_rad,
        tiltIsoplanatic_rad,
        tiltStrehl,
        hoStrehl,
    };
}
