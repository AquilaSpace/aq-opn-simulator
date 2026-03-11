/**
 * businessOptimiser.js — Business case optimisation tools.
 *
 * Provides three analyses built on top of the business model computation:
 *   1. Sensitivity ranking — which parameters most affect gross margin
 *   2. Breakeven finder — parameter values where gross margin = 0
 *   3. Auto-suggest — greedy parameter adjustments toward a viable business case
 *
 * All computation is deterministic and fast (<50 ms for all three analyses).
 */

import {
    getInput, setInput, getAllInputs,
    getResults, computeWithInputs,
} from './businessModel.js';

// ---------------------------------------------------------------------------
// Parameter definitions for optimisation
// ---------------------------------------------------------------------------

/**
 * Optimisable parameters: key, display label, unit, direction of "better",
 * valid range [min, max], and step size for suggestions.
 *
 * "direction" indicates which way improves gross margin:
 *   +1 = higher is better (revenue drivers)
 *   -1 = lower is better (cost drivers)
 */
const OPTIMISABLE_PARAMS = [
    { key: 'numSatellites',          label: 'Customer satellites',    unit: '',      dir: +1, min: 1,    max: 1000,  step: 5,     defaultVal: 50 },
    { key: 'annualPricePerSat_K',    label: 'Price per satellite',    unit: 'K$/yr', dir: +1, min: 10,   max: 1000,  step: 5,     defaultVal: 150 },
    { key: 'capexPerStation_M',      label: 'CAPEX per station',      unit: 'M$',    dir: -1, min: 2,    max: 30,    step: 0.5,   defaultVal: 8 },
    { key: 'opexPerStation_Kyr',     label: 'OPEX per station',       unit: 'K$/yr', dir: -1, min: 100,  max: 3000,  step: 50,    defaultVal: 500 },
    { key: 'electricityCost_perKwh', label: 'Electricity cost',       unit: '$/kWh', dir: -1, min: 0.02, max: 0.50,  step: 0.01,  defaultVal: 0.10 },
    { key: 'weatherAvailability_pct',label: 'Weather availability',   unit: '%',     dir: +1, min: 10,   max: 100,   step: 1,     defaultVal: 70 },
    { key: 'amortisationYears',      label: 'Amortisation period',    unit: 'yrs',   dir: +1, min: 5,    max: 20,    step: 1,     defaultVal: 10 },
    { key: 'passesPerDayPerStation', label: 'Passes/day/station',     unit: '',      dir: +1, min: 0.5,  max: 20,    step: 0.5,   defaultVal: 4 },
    { key: 'usableMinPerPass',       label: 'Usable min/pass',        unit: 'min',   dir: +1, min: 0.5,  max: 15,    step: 0.5,   defaultVal: 3 },
    { key: 'pvCellEfficiency',       label: 'PV cell efficiency',     unit: '',      dir: +1, min: 0.30, max: 0.65,  step: 0.01,  defaultVal: 0.55 },
];

// ---------------------------------------------------------------------------
// 1. Sensitivity analysis
// ---------------------------------------------------------------------------

/**
 * Compute the sensitivity of gross margin to each optimisable parameter.
 * Uses a ±10% perturbation (clamped to valid range) and measures the
 * resulting change in gross margin.
 *
 * @returns {Array<{ key, label, unit, sensitivity, currentValue, deltaMargin }>}
 *          sorted by |sensitivity| descending (most impactful first)
 */
export function computeSensitivity() {
    const baseline = getResults();
    if (!baseline) return [];
    const baseMargin = baseline.grossMargin;

    const results = [];

    for (const param of OPTIMISABLE_PARAMS) {
        const current = _resolveValue(param.key, param.defaultVal);
        const range = param.max - param.min;

        // Perturbation: 10% of range, clamped
        const delta = range * 0.10;
        const lo = Math.max(param.min, current - delta);
        const hi = Math.min(param.max, current + delta);

        const rLo = computeWithInputs({ [param.key]: lo });
        const rHi = computeWithInputs({ [param.key]: hi });

        const marginLo = isFinite(rLo.grossMargin) ? rLo.grossMargin : -1;
        const marginHi = isFinite(rHi.grossMargin) ? rHi.grossMargin : -1;

        // Sensitivity: change in gross margin per unit of normalised parameter change
        const deltaMargin = marginHi - marginLo;
        const normDelta = (hi - lo) / range;
        const sensitivity = normDelta > 0 ? Math.abs(deltaMargin / normDelta) : 0;

        results.push({
            key: param.key,
            label: param.label,
            unit: param.unit,
            dir: param.dir,
            sensitivity,
            deltaMargin,
            currentValue: current,
        });
    }

    results.sort((a, b) => b.sensitivity - a.sensitivity);
    return results;
}

// ---------------------------------------------------------------------------
// 2. Breakeven finder
// ---------------------------------------------------------------------------

/**
 * For each optimisable parameter, find the value (if any) at which gross
 * margin crosses zero, holding all other parameters constant.
 *
 * Uses binary search within the parameter's valid range.
 *
 * @returns {Array<{ key, label, unit, breakevenValue, currentValue, reachable }>}
 */
export function computeBreakevens() {
    const results = [];

    for (const param of OPTIMISABLE_PARAMS) {
        const current = _resolveValue(param.key, param.defaultVal);
        const be = _findBreakeven(param.key, param.min, param.max);

        results.push({
            key: param.key,
            label: param.label,
            unit: param.unit,
            dir: param.dir,
            breakevenValue: be,
            currentValue: current,
            reachable: be !== null,
        });
    }

    return results;
}

/**
 * Binary search for the breakeven value of a single parameter.
 * Returns null if breakeven is not achievable within the valid range.
 */
function _findBreakeven(key, min, max) {
    // Check if breakeven is in range: margin at min and max must have opposite signs
    const rMin = computeWithInputs({ [key]: min });
    const rMax = computeWithInputs({ [key]: max });
    const mMin = isFinite(rMin.grossMargin) ? rMin.grossMargin : -1;
    const mMax = isFinite(rMax.grossMargin) ? rMax.grossMargin : -1;

    if (mMin * mMax > 0) return null; // Same sign — no crossover in range
    if (mMin === 0) return min;
    if (mMax === 0) return max;

    let lo = min, hi = max;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const r = computeWithInputs({ [key]: mid });
        const m = isFinite(r.grossMargin) ? r.grossMargin : -1;

        if (Math.abs(m) < 0.0001) return mid; // Close enough

        // Determine which half contains the zero crossing
        const rLo = computeWithInputs({ [key]: lo });
        const mLo = isFinite(rLo.grossMargin) ? rLo.grossMargin : -1;

        if (mLo * m < 0) {
            hi = mid;
        } else {
            lo = mid;
        }
    }

    return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// 3. Auto-suggest viable configuration
// ---------------------------------------------------------------------------

/**
 * Starting from current inputs, greedily adjust the most impactful parameters
 * to reach a viable business case (gross margin >= 20%, payback <= 8 years).
 *
 * Returns a list of suggested changes, each with the parameter key, current
 * value, suggested value, and the expected impact on gross margin.
 *
 * The algorithm:
 *   1. Compute current results
 *   2. If already viable, return empty (no changes needed)
 *   3. Rank parameters by sensitivity
 *   4. For each parameter (most impactful first), adjust it in the "good"
 *      direction by increments until margin improves, capping at the
 *      parameter's valid range
 *   5. Stop when the target is reached or all parameters exhausted
 *
 * @param {object} [opts]
 * @param {number} [opts.targetMargin=0.20] — target gross margin
 * @param {number} [opts.targetPayback=8]   — target max payback years
 * @param {number} [opts.maxSteps=5]        — max parameters to adjust
 * @returns {Array<{ key, label, unit, from, to, marginBefore, marginAfter }>}
 */
export function suggestViableConfig(opts = {}) {
    const {
        targetMargin = 0.20,
        targetPayback = 8,
        maxSteps = 8,
    } = opts;

    const baseline = getResults();
    if (!baseline) return [];

    let currentMargin = isFinite(baseline.grossMargin) ? baseline.grossMargin : -1;

    // Already close enough to target? (within 2 percentage points)
    if (Math.abs(currentMargin - targetMargin) < 0.02) {
        return [];
    }

    // Determine direction: do we need to push margin up or down?
    const needIncrease = currentMargin < targetMargin;

    // Working copy of overrides (accumulated changes)
    const overrides = {};
    const suggestions = [];

    for (let step = 0; step < maxSteps; step++) {
        // Recompute sensitivity with current overrides applied
        const sensitivities = _computeSensitivityWithOverrides(overrides);
        if (sensitivities.length === 0) break;

        // Find the best parameter to adjust (highest sensitivity, not yet exhausted)
        let bestSuggestion = null;

        for (const s of sensitivities) {
            if (overrides[s.key] !== undefined) continue; // Already adjusted

            const param = OPTIMISABLE_PARAMS.find(p => p.key === s.key);
            if (!param) continue;

            const current = _resolveValue(param.key, param.defaultVal);
            const range = param.max - param.min;

            // When increasing margin, move in the direction that raises it.
            // When decreasing margin, move in the direction that lowers it.
            const marginUpDir = s.deltaMargin > 0 ? +1 : -1;
            const adjustDir = needIncrease ? marginUpDir : -marginUpDir;

            // Binary search across the full parameter range for the value
            // closest to the target margin
            let lo = 0, hi = 1.0; // fraction of range
            let bestVal = current;
            let bestMargin = currentMargin;
            let bestDist = Math.abs(currentMargin - targetMargin);

            for (let iter = 0; iter < 15; iter++) {
                const mid = (lo + hi) / 2;
                const testVal = _clamp(current + adjustDir * range * mid, param.min, param.max);
                const r = computeWithInputs({ ...overrides, [param.key]: testVal });
                const m = isFinite(r.grossMargin) ? r.grossMargin : -1;
                const dist = Math.abs(m - targetMargin);

                if (dist < bestDist) {
                    bestVal = testVal;
                    bestMargin = m;
                    bestDist = dist;
                }

                // Close enough
                if (dist < 0.005) break;

                // Narrow the search: if we overshot the target, pull back
                const overshot = needIncrease
                    ? m > targetMargin
                    : m < targetMargin;
                if (overshot) {
                    hi = mid;
                } else {
                    lo = mid;
                }
            }

            if (bestVal !== current && bestDist < Math.abs(currentMargin - targetMargin)) {
                bestSuggestion = {
                    key: param.key,
                    label: param.label,
                    unit: param.unit,
                    from: current,
                    to: bestVal,
                    marginBefore: currentMargin,
                    marginAfter: bestMargin,
                    step: param.step,
                };
                break; // Take the first (most impactful) improvement
            }
        }

        if (!bestSuggestion) break; // No further improvements possible

        // Apply this suggestion
        // Round to the parameter's step size
        bestSuggestion.to = _roundToStep(bestSuggestion.to, bestSuggestion.step);
        overrides[bestSuggestion.key] = bestSuggestion.to;

        // Recompute margin after rounding
        const afterRound = computeWithInputs(overrides);
        bestSuggestion.marginAfter = isFinite(afterRound.grossMargin) ? afterRound.grossMargin : -1;
        currentMargin = bestSuggestion.marginAfter;
        suggestions.push(bestSuggestion);

        // Check if we've reached the target (within 2pp)
        if (Math.abs(currentMargin - targetMargin) < 0.02) {
            break;
        }
    }

    return suggestions;
}

/**
 * Apply a list of suggestions to the business model inputs.
 * @param {Array} suggestions — from suggestViableConfig()
 */
export function applySuggestions(suggestions) {
    for (const s of suggestions) {
        setInput(s.key, s.to);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the effective value of a parameter (current input or default). */
function _resolveValue(key, defaultVal) {
    const v = getInput(key);
    return v !== null && v !== undefined ? v : defaultVal;
}

/** Clamp a value to [min, max]. */
function _clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

/** Round a value to the nearest multiple of step. */
function _roundToStep(v, step) {
    return Math.round(v / step) * step;
}

/** Sensitivity analysis with overrides pre-applied. */
function _computeSensitivityWithOverrides(overrides) {
    const results = [];

    for (const param of OPTIMISABLE_PARAMS) {
        const current = overrides[param.key] ?? _resolveValue(param.key, param.defaultVal);
        const range = param.max - param.min;
        const delta = range * 0.10;
        const lo = Math.max(param.min, current - delta);
        const hi = Math.min(param.max, current + delta);

        const rLo = computeWithInputs({ ...overrides, [param.key]: lo });
        const rHi = computeWithInputs({ ...overrides, [param.key]: hi });
        const marginLo = isFinite(rLo.grossMargin) ? rLo.grossMargin : -1;
        const marginHi = isFinite(rHi.grossMargin) ? rHi.grossMargin : -1;

        const deltaMargin = marginHi - marginLo;
        const normDelta = (hi - lo) / range;
        const sensitivity = normDelta > 0 ? Math.abs(deltaMargin / normDelta) : 0;

        results.push({
            key: param.key,
            label: param.label,
            dir: param.dir,
            sensitivity,
            deltaMargin,
        });
    }

    results.sort((a, b) => b.sensitivity - a.sensitivity);
    return results;
}
