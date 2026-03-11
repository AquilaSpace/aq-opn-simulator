/**
 * businessModel.js — Core calculation engine for the Business Model & Unit Economics module.
 *
 * Maintains all business model input state (slider values), reads from simulation state
 * (node counts, link budgets, orbital passes), computes financial outputs, and exposes
 * results for the UI panel and JSON export.
 *
 * Singleton pattern with closure-based state, consistent with other modules.
 */

import { getAllNodes, onNodeChange } from './nodeManager.js';
import { getAllLinks, onLinkChange } from './linkManager.js';
import { computeFleetPassStats } from './passAnalyser.js';

// ---------------------------------------------------------------------------
// Default input values
// ---------------------------------------------------------------------------

const _defaults = {
    // Ground Infrastructure Costs
    capexPerStation_M: 8.0,          // M$
    opexPerStation_Kyr: 500,         // K$/yr
    amortisationYears: 10,
    electricityCost_perKwh: 0.10,    // $/kWh

    // Link Parameters (manual overrides — null means auto-populated from sim)
    laserOpticalPower_kW: null,      // null = auto from sim
    avgLinkEfficiency_pct: null,     // null = auto from sim
    weatherAvailability_pct: 70,
    passesPerDayPerStation: null,    // null = auto from pass analyser
    usableMinPerPass: null,          // null = auto from pass analyser
    minBeamingElevation_deg: 45,

    // Customer Fleet
    numSatellites: null,             // null = auto from sim
    annualPricePerSat_K: 150,       // K$/yr
    displacedMassPerSat_kg: 12,
    launchCostPerKg: 4000,          // $/kg
    displacedHwCostPerKg: 15000,    // $/kg

    // Receiver Parameters
    pvCellEfficiency: 0.55,
    receiverDiameter_m: null,        // null = auto from sim
    massPerCell_kg: 0.0013,

    // Eclipse energy budget target
    targetPower_kW: 0.5,            // kW continuous during eclipse
};

// ---------------------------------------------------------------------------
// Mutable state
// ---------------------------------------------------------------------------

/** Current input values (overrides merged with defaults) */
const _inputs = { ..._defaults };

/** Cached results from last computation */
let _results = null;

/** Debounce timer for recomputation */
let _recomputeTimer = null;

/** Registered change listeners */
const _changeListeners = [];

/** Whether pass analysis has been computed at least once */
let _passStatsCache = null;
let _passStatsDirty = true;

// ---------------------------------------------------------------------------
// Input getters / setters
// ---------------------------------------------------------------------------

/**
 * Get the current value of a business model input.
 * @param {string} key
 * @returns {*}
 */
export function getInput(key) {
    return _inputs[key];
}

/**
 * Set a business model input and trigger recomputation.
 * @param {string} key
 * @param {*} value
 */
export function setInput(key, value) {
    if (_inputs[key] === value) return;
    _inputs[key] = value;
    // Mark pass stats dirty if elevation changed
    if (key === 'minBeamingElevation_deg') {
        _passStatsDirty = true;
    }
    _scheduleRecompute();
}

/**
 * Get all current inputs (shallow copy).
 * @returns {object}
 */
export function getAllInputs() {
    return { ..._inputs };
}

// ---------------------------------------------------------------------------
// Simulation state readers
// ---------------------------------------------------------------------------

/** Count ground source nodes in the simulation */
function _countGroundStations() {
    return getAllNodes().filter(n => n.type === 'GROUND_SOURCE').length;
}

/** Count orbital customer nodes in the simulation */
function _countOrbitalCustomers() {
    return getAllNodes().filter(n => n.type === 'ORBITAL_CUSTOMER').length;
}

/** Get average laser optical power across ground source nodes (kW) */
function _avgLaserPower_kW() {
    const sources = getAllNodes().filter(n => n.type === 'GROUND_SOURCE');
    if (sources.length === 0) return 0;
    const total = sources.reduce((sum, n) => sum + (n.params.transmitPower_kW || 0), 0);
    return total / sources.length;
}

/** Get average receiver diameter across orbital customers (m) */
function _avgReceiverDiameter_m() {
    const customers = getAllNodes().filter(n => n.type === 'ORBITAL_CUSTOMER');
    if (customers.length === 0) return 3.0;
    const total = customers.reduce((sum, n) => sum + (n.params.apertureDiameter_m || n.params.receiveAperture_m || 3.0), 0);
    return total / customers.length;
}

/**
 * Compute fleet-average link efficiency from active simulation links.
 * Efficiency = rxPower / txPower for each active ground→customer or ground→relay→customer chain.
 * @returns {number} average efficiency (0–1)
 */
function _computeAvgLinkEfficiency() {
    const links = getAllLinks();
    const activeLinks = links.filter(l =>
        l.budget && (l.status === 'ACTIVE' || l.status === 'MARGINAL'),
    );
    if (activeLinks.length === 0) return 0.12; // Reasonable default

    let totalEff = 0;
    let count = 0;
    for (const link of activeLinks) {
        const b = link.budget;
        if (b.txPower_W > 0) {
            totalEff += b.rxPower_W / b.txPower_W;
            count++;
        }
    }
    return count > 0 ? totalEff / count : 0.12;
}

// ---------------------------------------------------------------------------
// Pass analysis (expensive — cached and computed on demand)
// ---------------------------------------------------------------------------

function _recomputePassStats() {
    const groundStations = getAllNodes().filter(n => n.type === 'GROUND_SOURCE');
    const orbitalCustomers = getAllNodes().filter(n => n.type === 'ORBITAL_CUSTOMER');
    const minElev = _inputs.minBeamingElevation_deg;

    _passStatsCache = computeFleetPassStats(groundStations, orbitalCustomers, minElev);
    _passStatsDirty = false;
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Recompute all business model outputs from current inputs and simulation state.
 * @returns {object} full results object
 */
function _compute() {
    // Auto-populated values (use override if set, otherwise read from sim)
    const numStations = _countGroundStations();
    const numSatellites = _inputs.numSatellites ?? _countOrbitalCustomers();
    const laserPower_kW = _inputs.laserOpticalPower_kW ?? _avgLaserPower_kW();
    const receiverDiam_m = _inputs.receiverDiameter_m ?? _avgReceiverDiameter_m();

    // Link efficiency
    const avgLinkEfficiency = _inputs.avgLinkEfficiency_pct !== null
        ? _inputs.avgLinkEfficiency_pct / 100
        : _computeAvgLinkEfficiency();

    // Pass statistics (use override if set)
    let passesPerDayPerStation, usableMinPerPass;
    if (_inputs.passesPerDayPerStation !== null) {
        passesPerDayPerStation = _inputs.passesPerDayPerStation;
    } else {
        if (_passStatsDirty) _recomputePassStats();
        passesPerDayPerStation = _passStatsCache?.avgPassesPerDayPerStation ?? 4;
    }
    if (_inputs.usableMinPerPass !== null) {
        usableMinPerPass = _inputs.usableMinPerPass;
    } else {
        if (_passStatsDirty) _recomputePassStats();
        usableMinPerPass = _passStatsCache?.avgUsableMinPerPass ?? 3;
    }

    const weatherAvailability = _inputs.weatherAvailability_pct / 100;
    const pvEfficiency = _inputs.pvCellEfficiency;

    // -----------------------------------------------------------------------
    // Energy delivery
    // -----------------------------------------------------------------------
    const peakDelivered_kW = laserPower_kW * avgLinkEfficiency;
    const peakElectrical_kW = peakDelivered_kW * pvEfficiency;
    const energyPerPass_Wh = peakElectrical_kW * (usableMinPerPass / 60) * 1000;
    const effectivePassesPerDay = passesPerDayPerStation * numStations * weatherAvailability;
    const whPerDayPerSat = numSatellites > 0
        ? (energyPerPass_Wh * effectivePassesPerDay) / numSatellites
        : 0;
    const kwhPerYearFleet = (energyPerPass_Wh * effectivePassesPerDay * 365) / 1000;
    const kwhPerYearPerSat = numSatellites > 0 ? kwhPerYearFleet / numSatellites : 0;

    // -----------------------------------------------------------------------
    // Eclipse energy budget
    // -----------------------------------------------------------------------
    const orbitalPeriod_min = 96; // ~500 km LEO
    const eclipseFraction = 0.35;
    const orbitsPerDay = 1440 / orbitalPeriod_min;
    const eclipseWh_perDay = _inputs.targetPower_kW * eclipseFraction
        * (orbitalPeriod_min / 60) * orbitsPerDay * 1000;
    const eclipseCoverage_pct = eclipseWh_perDay > 0
        ? Math.min(100, (whPerDayPerSat / eclipseWh_perDay) * 100)
        : 0;

    // -----------------------------------------------------------------------
    // Financials
    // -----------------------------------------------------------------------
    const capexPerStation = _inputs.capexPerStation_M * 1e6;
    const opexPerStation = _inputs.opexPerStation_Kyr * 1e3;
    const totalCapex = numStations * capexPerStation;
    const annualCapexAmort = _inputs.amortisationYears > 0
        ? totalCapex / _inputs.amortisationYears
        : 0;
    const annualOpex = numStations * opexPerStation;

    // Electricity: duty cycle = total beaming hours per year per station
    const dutyHoursPerYear = passesPerDayPerStation * (usableMinPerPass / 60)
        * weatherAvailability * 365;
    const annualElectricity = numStations * laserPower_kW * dutyHoursPerYear
        * _inputs.electricityCost_perKwh;

    const totalAnnualCost = annualCapexAmort + annualOpex + annualElectricity;
    const annualPricePerSat = _inputs.annualPricePerSat_K * 1e3;
    const annualRevenue = numSatellites * annualPricePerSat;
    const annualProfit = annualRevenue - totalAnnualCost;
    const grossMargin = annualRevenue > 0
        ? (annualRevenue - totalAnnualCost) / annualRevenue
        : -Infinity;
    const paybackYears = annualProfit > 0
        ? totalCapex / annualProfit
        : Infinity;

    // Cost per kWh delivered
    const costPerKwh = kwhPerYearFleet > 0
        ? totalAnnualCost / kwhPerYearFleet
        : Infinity;

    // -----------------------------------------------------------------------
    // Customer value proposition
    // -----------------------------------------------------------------------
    const launchSavingsPerSat = _inputs.displacedMassPerSat_kg * _inputs.launchCostPerKg;
    const hwSavingsPerSat = _inputs.displacedMassPerSat_kg * _inputs.displacedHwCostPerKg;
    const totalSavingsPerSat = launchSavingsPerSat + hwSavingsPerSat;
    const customerPaybackYears = annualPricePerSat > 0
        ? annualPricePerSat / totalSavingsPerSat
        : Infinity;
    const customerRoi = annualPricePerSat > 0
        ? totalSavingsPerSat / annualPricePerSat
        : 0;

    // -----------------------------------------------------------------------
    // Viability classification
    // -----------------------------------------------------------------------
    let viability;
    if (grossMargin > 0.20 && paybackYears <= 8) {
        viability = 'VIABLE';
    } else if (grossMargin > 0) {
        viability = 'MARGINAL';
    } else {
        viability = 'NOT_VIABLE';
    }

    return {
        // Auto-populated values (for display)
        numStations,
        numSatellites,
        laserPower_kW,
        avgLinkEfficiency,
        receiverDiam_m,
        passesPerDayPerStation,
        usableMinPerPass,
        weatherAvailability,
        pvEfficiency,

        // Energy delivery
        peakDelivered_kW,
        peakElectrical_kW,
        energyPerPass_Wh,
        effectivePassesPerDay,
        whPerDayPerSat,
        kwhPerYearFleet,
        kwhPerYearPerSat,

        // Eclipse
        eclipseWh_perDay,
        eclipseCoverage_pct,

        // Cost breakdown
        totalCapex,
        annualCapexAmort,
        annualOpex,
        annualElectricity,
        totalAnnualCost,

        // Revenue & profit
        annualRevenue,
        annualProfit,
        grossMargin,
        paybackYears,
        costPerKwh,

        // Customer value
        launchSavingsPerSat,
        hwSavingsPerSat,
        totalSavingsPerSat,
        customerPaybackYears,
        customerRoi,

        // Viability
        viability,
    };
}

// ---------------------------------------------------------------------------
// Scheduling & events
// ---------------------------------------------------------------------------

function _scheduleRecompute() {
    clearTimeout(_recomputeTimer);
    _recomputeTimer = setTimeout(() => {
        _results = _compute();
        for (const fn of _changeListeners) fn(_results);
    }, 200);
}

/**
 * Register a callback for when results change.
 * @param {function} fn — called with the new results object
 */
export function onBusinessModelChange(fn) {
    _changeListeners.push(fn);
}

/**
 * Get the latest computed results (may be null if never computed).
 * @returns {object|null}
 */
export function getResults() {
    if (!_results) _results = _compute();
    return _results;
}

/**
 * Force a recomputation now (synchronous).
 * @returns {object}
 */
export function recompute() {
    _passStatsDirty = true;
    _results = _compute();
    for (const fn of _changeListeners) fn(_results);
    return _results;
}

// ---------------------------------------------------------------------------
// Export helper
// ---------------------------------------------------------------------------

/**
 * Generate a JSON-serialisable business case export object.
 * @returns {object}
 */
export function exportBusinessCase() {
    const results = getResults();
    const nodes = getAllNodes();

    return {
        timestamp: new Date().toISOString(),
        simulatorConfig: {
            groundStations: nodes.filter(n => n.type === 'GROUND_SOURCE').map(n => ({
                name: n.name,
                position: n.position,
                laserPower_kW: n.params.transmitPower_kW,
                aperture_m: n.params.apertureDiameter_m,
            })),
            customerSatellites: nodes.filter(n => n.type === 'ORBITAL_CUSTOMER').map(n => ({
                name: n.name,
                orbitalElements: n.params.orbitalElements,
                receiverDiameter_m: n.params.apertureDiameter_m,
            })),
        },
        businessModelInputs: { ..._inputs },
        results: results ? { ...results } : null,
        passAnalysis: _passStatsCache ? { ..._passStatsCache } : null,
    };
}

// ---------------------------------------------------------------------------
// Standalone computation with arbitrary inputs (for optimiser)
// ---------------------------------------------------------------------------

/**
 * Run the business model computation with a set of input overrides, without
 * mutating internal state. Used by the optimiser for sensitivity analysis,
 * breakeven search, and auto-suggest.
 *
 * @param {object} overrides — partial input object; keys not present fall back
 *                             to current _inputs values
 * @returns {object} full results object (same shape as getResults())
 */
export function computeWithInputs(overrides) {
    // Snapshot inputs with overrides applied
    const inp = { ..._inputs, ...overrides };

    // Read sim state (same as _compute)
    const numStations = _countGroundStations();
    const numSatellites = inp.numSatellites ?? _countOrbitalCustomers();
    const laserPower_kW = inp.laserOpticalPower_kW ?? _avgLaserPower_kW();

    const avgLinkEfficiency = inp.avgLinkEfficiency_pct !== null
        ? inp.avgLinkEfficiency_pct / 100
        : _computeAvgLinkEfficiency();

    let passesPerDayPerStation;
    if (inp.passesPerDayPerStation !== null) {
        passesPerDayPerStation = inp.passesPerDayPerStation;
    } else {
        if (_passStatsDirty) _recomputePassStats();
        passesPerDayPerStation = _passStatsCache?.avgPassesPerDayPerStation ?? 4;
    }

    let usableMinPerPass;
    if (inp.usableMinPerPass !== null) {
        usableMinPerPass = inp.usableMinPerPass;
    } else {
        if (_passStatsDirty) _recomputePassStats();
        usableMinPerPass = _passStatsCache?.avgUsableMinPerPass ?? 3;
    }

    const weatherAvailability = inp.weatherAvailability_pct / 100;
    const pvEfficiency = inp.pvCellEfficiency;

    // Energy delivery
    const peakDelivered_kW = laserPower_kW * avgLinkEfficiency;
    const peakElectrical_kW = peakDelivered_kW * pvEfficiency;
    const energyPerPass_Wh = peakElectrical_kW * (usableMinPerPass / 60) * 1000;
    const effectivePassesPerDay = passesPerDayPerStation * numStations * weatherAvailability;
    const whPerDayPerSat = numSatellites > 0
        ? (energyPerPass_Wh * effectivePassesPerDay) / numSatellites
        : 0;
    const kwhPerYearFleet = (energyPerPass_Wh * effectivePassesPerDay * 365) / 1000;

    // Financials
    const capexPerStation = inp.capexPerStation_M * 1e6;
    const opexPerStation = inp.opexPerStation_Kyr * 1e3;
    const totalCapex = numStations * capexPerStation;
    const annualCapexAmort = inp.amortisationYears > 0
        ? totalCapex / inp.amortisationYears
        : 0;
    const annualOpex = numStations * opexPerStation;
    const dutyHoursPerYear = passesPerDayPerStation * (usableMinPerPass / 60)
        * weatherAvailability * 365;
    const annualElectricity = numStations * laserPower_kW * dutyHoursPerYear
        * inp.electricityCost_perKwh;
    const totalAnnualCost = annualCapexAmort + annualOpex + annualElectricity;

    const annualPricePerSat = inp.annualPricePerSat_K * 1e3;
    const annualRevenue = numSatellites * annualPricePerSat;
    const annualProfit = annualRevenue - totalAnnualCost;
    const grossMargin = annualRevenue > 0
        ? (annualRevenue - totalAnnualCost) / annualRevenue
        : -Infinity;
    const paybackYears = annualProfit > 0
        ? totalCapex / annualProfit
        : Infinity;

    return {
        numStations, numSatellites, laserPower_kW,
        avgLinkEfficiency, passesPerDayPerStation, usableMinPerPass,
        weatherAvailability, pvEfficiency,
        peakDelivered_kW, peakElectrical_kW, energyPerPass_Wh,
        effectivePassesPerDay, whPerDayPerSat, kwhPerYearFleet,
        totalCapex, annualCapexAmort, annualOpex, annualElectricity,
        totalAnnualCost, annualRevenue, annualProfit,
        grossMargin, paybackYears,
    };
}

// ---------------------------------------------------------------------------
// Initialisation — subscribe to sim state changes
// ---------------------------------------------------------------------------

/**
 * Initialise the business model module. Call once during app startup.
 */
export function initBusinessModel() {
    onNodeChange(() => {
        _passStatsDirty = true;
        _scheduleRecompute();
    });
    onLinkChange(() => {
        _scheduleRecompute();
    });

    // Initial computation
    _results = _compute();
}
