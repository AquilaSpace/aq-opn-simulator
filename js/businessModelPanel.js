/**
 * businessModelPanel.js — UI panel for the Business Model & Unit Economics module.
 *
 * Builds the collapsible sidebar panel, creates slider controls for all inputs,
 * displays computed results, and handles the "Export Business Case" button.
 */

import { createSliderControl, createSectionTitle } from './uiPanel.js';
import {
    getInput, setInput, getAllInputs, getResults,
    onBusinessModelChange, exportBusinessCase, recompute,
} from './businessModel.js';
import {
    computeSensitivity, computeBreakevens,
    suggestViableConfig, applySuggestions,
} from './businessOptimiser.js';
import { TOOLTIPS } from './tooltip.js';

// ---------------------------------------------------------------------------
// DOM references (populated in buildPanel)
// ---------------------------------------------------------------------------

let _panelBody = null;
let _viabilityBanner = null;
let _resultsContainer = null;

// Slider controls that may need auto-updating
let _laserPowerSlider = null;
let _linkEfficiencySlider = null;
let _passesPerDaySlider = null;
let _usableMinSlider = null;
let _numSatellitesSlider = null;
let _receiverDiamSlider = null;

/** Container for optimiser output */
let _optimiserResults = null;

/** Callback invoked after suggestions are applied (for scene sync) */
let _onApplySuggestions = null;

/** Target margin slider + current value */
let _targetMarginSlider = null;
let _targetMarginPct = 20;

// ---------------------------------------------------------------------------
// Panel construction
// ---------------------------------------------------------------------------

/**
 * Register a callback invoked when optimiser suggestions are applied.
 * @param {function} fn — called with the suggestions array
 */
export function onSuggestionsApplied(fn) {
    _onApplySuggestions = fn;
}

/**
 * Build and insert the Business Model panel into the sidebar.
 * Call once during app setup, after the DOM is ready.
 */
export function buildBusinessModelPanel() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Create the panel element
    const panel = document.createElement('div');
    panel.className = 'panel collapsed';
    panel.id = 'panel-business-model';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'Business Model';
    panel.appendChild(header);

    // Viability banner (visible even when collapsed)
    _viabilityBanner = document.createElement('div');
    _viabilityBanner.className = 'bm-viability-banner';
    _viabilityBanner.textContent = 'Loading...';
    panel.appendChild(_viabilityBanner);

    _panelBody = document.createElement('div');
    _panelBody.className = 'panel-body';
    panel.appendChild(_panelBody);

    // Insert before the Camera panel (after Revenue Model)
    const cameraPanel = document.getElementById('panel-camera');
    if (cameraPanel) {
        sidebar.insertBefore(panel, cameraPanel);
    } else {
        sidebar.appendChild(panel);
    }

    // Wire collapse toggle (must come after insertion)
    header.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
    });

    // Build internal sections — results first so key metrics are visible
    // at the top of the panel while the user scrolls down to adjust sliders
    _buildResultsSection();
    _buildInputSections();

    // Subscribe to results changes
    onBusinessModelChange(_updateResults);

    // Initial render
    const results = getResults();
    if (results) _updateResults(results);
}

// ---------------------------------------------------------------------------
// Input section builders
// ---------------------------------------------------------------------------

function _buildInputSections() {
    // -- Ground Infrastructure Costs --
    _panelBody.appendChild(createSectionTitle('Ground Infrastructure'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'CAPEX / station',
        id: 'bm-capex',
        min: 2, max: 30, step: 0.5,
        value: getInput('capexPerStation_M'),
        unit: 'M$',
        onChange: v => setInput('capexPerStation_M', v),
    }), 'bm-capex'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'OPEX / station',
        id: 'bm-opex',
        min: 100, max: 3000, step: 50,
        value: getInput('opexPerStation_Kyr'),
        unit: 'K$/yr',
        onChange: v => setInput('opexPerStation_Kyr', v),
    }), 'bm-opex'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'Amortisation',
        id: 'bm-amort',
        min: 5, max: 20, step: 1,
        value: getInput('amortisationYears'),
        unit: 'yrs',
        onChange: v => setInput('amortisationYears', v),
    }), 'bm-amort'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'Electricity',
        id: 'bm-elec',
        min: 0.02, max: 0.50, step: 0.01,
        value: getInput('electricityCost_perKwh'),
        unit: '$/kWh',
        onChange: v => setInput('electricityCost_perKwh', v),
    }), 'bm-elec'));

    // -- Link Parameters --
    _panelBody.appendChild(createSectionTitle('Link Parameters'));

    _laserPowerSlider = createSliderControl({
        label: 'Laser power',
        id: 'bm-laser-power',
        min: 1, max: 5000, step: 10,
        value: getInput('laserOpticalPower_kW') ?? 1000,
        unit: 'kW',
        onChange: v => setInput('laserOpticalPower_kW', v),
    });
    _panelBody.appendChild(_tip(_laserPowerSlider, 'bm-laser-power'));

    _linkEfficiencySlider = createSliderControl({
        label: 'Link efficiency',
        id: 'bm-link-eff',
        min: 0.1, max: 100, step: 0.1,
        value: getInput('avgLinkEfficiency_pct') ?? 12,
        unit: '%',
        onChange: v => setInput('avgLinkEfficiency_pct', v),
    });
    _panelBody.appendChild(_tip(_linkEfficiencySlider, 'bm-link-eff'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'Weather avail.',
        id: 'bm-weather',
        min: 10, max: 100, step: 1,
        value: getInput('weatherAvailability_pct'),
        unit: '%',
        onChange: v => setInput('weatherAvailability_pct', v),
    }), 'bm-weather'));

    _passesPerDaySlider = createSliderControl({
        label: 'Passes/day/stn',
        id: 'bm-passes',
        min: 0, max: 20, step: 0.1,
        value: getInput('passesPerDayPerStation') ?? 4,
        unit: '',
        onChange: v => setInput('passesPerDayPerStation', v),
    });
    _panelBody.appendChild(_tip(_passesPerDaySlider, 'bm-passes'));

    _usableMinSlider = createSliderControl({
        label: 'Min / pass',
        id: 'bm-min-pass',
        min: 0.5, max: 15, step: 0.1,
        value: getInput('usableMinPerPass') ?? 3,
        unit: 'min',
        onChange: v => setInput('usableMinPerPass', v),
    });
    _panelBody.appendChild(_tip(_usableMinSlider, 'bm-min-pass'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'Min elevation',
        id: 'bm-min-elev',
        min: 20, max: 80, step: 1,
        value: getInput('minBeamingElevation_deg'),
        unit: '\u00B0',
        onChange: v => setInput('minBeamingElevation_deg', v),
    }), 'bm-min-elev'));

    // -- Customer Fleet --
    _panelBody.appendChild(createSectionTitle('Customer Fleet'));

    _numSatellitesSlider = createSliderControl({
        label: 'Satellites',
        id: 'bm-num-sats',
        min: 1, max: 1000, step: 1,
        value: getInput('numSatellites') ?? 50,
        unit: '',
        onChange: v => setInput('numSatellites', v),
    });
    _panelBody.appendChild(_tip(_numSatellitesSlider, 'bm-num-sats'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'Price / sat',
        id: 'bm-price-sat',
        min: 10, max: 1000, step: 5,
        value: getInput('annualPricePerSat_K'),
        unit: 'K$/yr',
        onChange: v => setInput('annualPricePerSat_K', v),
    }), 'bm-price-sat'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'Mass displaced',
        id: 'bm-mass',
        min: 1, max: 50, step: 0.5,
        value: getInput('displacedMassPerSat_kg'),
        unit: 'kg',
        onChange: v => setInput('displacedMassPerSat_kg', v),
    }), 'bm-mass'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'Launch $/kg',
        id: 'bm-launch-cost',
        min: 500, max: 15000, step: 100,
        value: getInput('launchCostPerKg'),
        unit: '$/kg',
        onChange: v => setInput('launchCostPerKg', v),
    }), 'bm-launch-cost'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'HW $/kg',
        id: 'bm-hw-cost',
        min: 2000, max: 80000, step: 500,
        value: getInput('displacedHwCostPerKg'),
        unit: '$/kg',
        onChange: v => setInput('displacedHwCostPerKg', v),
    }), 'bm-hw-cost'));

    // -- Receiver Parameters --
    _panelBody.appendChild(createSectionTitle('Receiver'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'PV efficiency',
        id: 'bm-pv-eff',
        min: 0.30, max: 0.65, step: 0.01,
        value: getInput('pvCellEfficiency'),
        unit: '',
        onChange: v => setInput('pvCellEfficiency', v),
    }), 'bm-pv-eff'));

    _panelBody.appendChild(_tip(createSliderControl({
        label: 'Target power',
        id: 'bm-target-power',
        min: 0.1, max: 5, step: 0.1,
        value: getInput('targetPower_kW'),
        unit: 'kW',
        onChange: v => setInput('targetPower_kW', v),
    }), 'bm-target-power'));

    // -- Recalculate & Export buttons --
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 4px; margin-top: 8px;';

    const recalcBtn = document.createElement('button');
    recalcBtn.className = 'btn btn-sm';
    recalcBtn.textContent = 'Recalculate Passes';
    recalcBtn.title = 'Recompute pass statistics from current orbital configuration (may take a moment)';
    recalcBtn.addEventListener('click', () => {
        recalcBtn.textContent = 'Computing...';
        recalcBtn.disabled = true;
        setTimeout(() => {
            recompute();
            recalcBtn.textContent = 'Recalculate Passes';
            recalcBtn.disabled = false;
        }, 50);
    });
    btnRow.appendChild(recalcBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-sm btn-primary';
    exportBtn.textContent = 'Export Business Case';
    exportBtn.addEventListener('click', _exportJSON);
    btnRow.appendChild(exportBtn);

    _panelBody.appendChild(btnRow);

    // -- Optimiser section --
    _panelBody.appendChild(createSectionTitle('Optimiser'));

    const optBtnRow = document.createElement('div');
    optBtnRow.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px;';

    const sensitivityBtn = document.createElement('button');
    sensitivityBtn.className = 'btn btn-sm';
    sensitivityBtn.textContent = 'Sensitivity';
    sensitivityBtn.title = 'Rank parameters by their impact on gross margin';
    sensitivityBtn.addEventListener('click', _showSensitivity);
    optBtnRow.appendChild(sensitivityBtn);

    const breakevenBtn = document.createElement('button');
    breakevenBtn.className = 'btn btn-sm';
    breakevenBtn.textContent = 'Breakevens';
    breakevenBtn.title = 'Find the parameter value at which the business case breaks even';
    breakevenBtn.addEventListener('click', _showBreakevens);
    optBtnRow.appendChild(breakevenBtn);

    const suggestBtn = document.createElement('button');
    suggestBtn.className = 'btn btn-sm btn-primary';
    suggestBtn.textContent = 'Auto-Suggest';
    suggestBtn.title = 'Suggest parameter adjustments to reach the target margin';
    suggestBtn.addEventListener('click', _showSuggestions);
    optBtnRow.appendChild(suggestBtn);

    _panelBody.appendChild(optBtnRow);

    // Target margin slider
    _targetMarginSlider = createSliderControl({
        label: 'Target margin',
        id: 'bm-target-margin',
        min: 5, max: 60, step: 1,
        value: _targetMarginPct,
        unit: '%',
        onChange: v => { _targetMarginPct = v; },
    });
    _panelBody.appendChild(_targetMarginSlider);

    _optimiserResults = document.createElement('div');
    _optimiserResults.className = 'bm-optimiser-results';
    _panelBody.appendChild(_optimiserResults);
}

// ---------------------------------------------------------------------------
// Results section
// ---------------------------------------------------------------------------

function _buildResultsSection() {
    _resultsContainer = document.createElement('div');
    _resultsContainer.className = 'bm-results';
    _panelBody.appendChild(_resultsContainer);
}

function _updateResults(results) {
    if (!results || !_resultsContainer) return;

    // Update viability banner
    _updateViabilityBanner(results);

    // Update auto-populated slider values (when not overridden)
    _syncAutoSliders(results);

    // Build results display
    _resultsContainer.innerHTML = '';

    // Key Metrics
    _resultsContainer.appendChild(createSectionTitle('Key Metrics'));
    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'bm-metrics-grid';
    metricsGrid.innerHTML = `
        <div class="bm-metric">
            <span class="bm-metric-value ${_marginClass(results.grossMargin)}">${(results.grossMargin * 100).toFixed(1)}%</span>
            <span class="bm-metric-label" data-tooltip="${TOOLTIPS['bm-gross-margin'] || ''}">Gross Margin</span>
        </div>
        <div class="bm-metric">
            <span class="bm-metric-value ${results.paybackYears <= 8 ? 'bm-positive' : 'bm-warning'}">${results.paybackYears === Infinity ? '∞' : results.paybackYears.toFixed(1)} yr</span>
            <span class="bm-metric-label" data-tooltip="${TOOLTIPS['bm-payback'] || ''}">Payback Period</span>
        </div>
        <div class="bm-metric">
            <span class="bm-metric-value">${_formatMoney(results.annualRevenue)}</span>
            <span class="bm-metric-label">Annual Revenue</span>
        </div>
        <div class="bm-metric">
            <span class="bm-metric-value ${results.annualProfit >= 0 ? 'bm-positive' : 'bm-negative'}">${_formatMoney(results.annualProfit)}</span>
            <span class="bm-metric-label">Annual Profit</span>
        </div>
        <div class="bm-metric">
            <span class="bm-metric-value">${results.peakElectrical_kW.toFixed(1)} kW</span>
            <span class="bm-metric-label" data-tooltip="${TOOLTIPS['bm-peak-power'] || ''}">Peak Electrical</span>
        </div>
        <div class="bm-metric">
            <span class="bm-metric-value">${results.energyPerPass_Wh.toFixed(0)} Wh</span>
            <span class="bm-metric-label">Energy / Pass</span>
        </div>
        <div class="bm-metric">
            <span class="bm-metric-value">${results.whPerDayPerSat.toFixed(0)} Wh</span>
            <span class="bm-metric-label">Wh/day/sat</span>
        </div>
        <div class="bm-metric">
            <span class="bm-metric-value ${results.eclipseCoverage_pct >= 100 ? 'bm-positive' : results.eclipseCoverage_pct >= 50 ? 'bm-warning' : 'bm-negative'}">${results.eclipseCoverage_pct.toFixed(1)}%</span>
            <span class="bm-metric-label" data-tooltip="${TOOLTIPS['bm-eclipse'] || ''}">Eclipse Coverage</span>
        </div>
    `;
    _resultsContainer.appendChild(metricsGrid);

    // Cost breakdown
    _resultsContainer.appendChild(createSectionTitle('Annual Costs'));
    const costList = document.createElement('div');
    costList.className = 'bm-cost-list';
    costList.innerHTML = `
        <div class="bm-cost-row">
            <span>CAPEX (amortised)</span>
            <span>${_formatMoney(results.annualCapexAmort)}</span>
        </div>
        <div class="bm-cost-row">
            <span>Station OPEX</span>
            <span>${_formatMoney(results.annualOpex)}</span>
        </div>
        <div class="bm-cost-row">
            <span>Electricity</span>
            <span>${_formatMoney(results.annualElectricity)}</span>
        </div>
        <div class="bm-cost-row bm-cost-total">
            <span>Total Annual Cost</span>
            <span>${_formatMoney(results.totalAnnualCost)}</span>
        </div>
        <div class="bm-cost-row" style="margin-top: 4px;">
            <span>Cost / kWh delivered</span>
            <span>${results.costPerKwh === Infinity ? '∞' : '$' + results.costPerKwh.toFixed(2)}</span>
        </div>
    `;
    _resultsContainer.appendChild(costList);

    // Customer value
    _resultsContainer.appendChild(createSectionTitle('Customer Value'));
    const custList = document.createElement('div');
    custList.className = 'bm-cost-list';
    custList.innerHTML = `
        <div class="bm-cost-row">
            <span>Launch savings / sat</span>
            <span>${_formatMoney(results.launchSavingsPerSat)}</span>
        </div>
        <div class="bm-cost-row">
            <span>Hardware savings / sat</span>
            <span>${_formatMoney(results.hwSavingsPerSat)}</span>
        </div>
        <div class="bm-cost-row bm-cost-total">
            <span>Total savings / sat</span>
            <span>${_formatMoney(results.totalSavingsPerSat)}</span>
        </div>
        <div class="bm-cost-row">
            <span>Customer payback</span>
            <span>${results.customerPaybackYears === Infinity ? '∞' : results.customerPaybackYears.toFixed(2)} yr</span>
        </div>
        <div class="bm-cost-row">
            <span>ROI ratio</span>
            <span>${results.customerRoi.toFixed(1)}×</span>
        </div>
    `;
    _resultsContainer.appendChild(custList);

    // Fleet energy summary
    _resultsContainer.appendChild(createSectionTitle('Fleet Energy'));
    const energyList = document.createElement('div');
    energyList.className = 'bm-cost-list';
    energyList.innerHTML = `
        <div class="bm-cost-row">
            <span>kWh/yr (fleet)</span>
            <span>${_formatNumber(results.kwhPerYearFleet)}</span>
        </div>
        <div class="bm-cost-row">
            <span>kWh/yr per sat</span>
            <span>${results.kwhPerYearPerSat.toFixed(1)}</span>
        </div>
        <div class="bm-cost-row">
            <span>Eff. passes/day</span>
            <span>${results.effectivePassesPerDay.toFixed(1)}</span>
        </div>
    `;
    _resultsContainer.appendChild(energyList);
}

// ---------------------------------------------------------------------------
// Viability banner
// ---------------------------------------------------------------------------

function _updateViabilityBanner(results) {
    if (!_viabilityBanner) return;

    if (results.viability === 'VIABLE') {
        _viabilityBanner.textContent = '\u2713 Business case viable';
        _viabilityBanner.className = 'bm-viability-banner bm-viable';
    } else if (results.viability === 'MARGINAL') {
        _viabilityBanner.textContent = '\u26A0 Marginal';
        _viabilityBanner.className = 'bm-viability-banner bm-marginal';
    } else {
        _viabilityBanner.textContent = '\u2717 Not viable';
        _viabilityBanner.className = 'bm-viability-banner bm-not-viable';
    }
}

// ---------------------------------------------------------------------------
// Auto-sync sliders with sim state
// ---------------------------------------------------------------------------

function _syncAutoSliders(results) {
    // Only update slider display values when the input is in auto mode (null)
    if (getInput('laserOpticalPower_kW') === null && _laserPowerSlider?._setValue) {
        _laserPowerSlider._setValue(results.laserPower_kW.toFixed(0));
    }
    if (getInput('avgLinkEfficiency_pct') === null && _linkEfficiencySlider?._setValue) {
        _linkEfficiencySlider._setValue((results.avgLinkEfficiency * 100).toFixed(1));
    }
    if (getInput('passesPerDayPerStation') === null && _passesPerDaySlider?._setValue) {
        _passesPerDaySlider._setValue(results.passesPerDayPerStation.toFixed(1));
    }
    if (getInput('usableMinPerPass') === null && _usableMinSlider?._setValue) {
        _usableMinSlider._setValue(results.usableMinPerPass.toFixed(1));
    }
    if (getInput('numSatellites') === null && _numSatellitesSlider?._setValue) {
        _numSatellitesSlider._setValue(results.numSatellites);
    }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function _exportJSON() {
    const data = exportBusinessCase();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'opn-business-case.json';
    a.click();
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Optimiser displays
// ---------------------------------------------------------------------------

function _showSensitivity() {
    if (!_optimiserResults) return;
    _optimiserResults.innerHTML = '';

    const sensitivities = computeSensitivity();
    if (sensitivities.length === 0) {
        _optimiserResults.innerHTML = '<div class="empty-state">No data to analyse.</div>';
        return;
    }

    const maxSens = sensitivities[0].sensitivity || 1;

    const title = document.createElement('div');
    title.className = 'bm-opt-title';
    title.textContent = 'Sensitivity to Gross Margin';
    _optimiserResults.appendChild(title);

    for (const s of sensitivities) {
        const row = document.createElement('div');
        row.className = 'bm-tornado-row';

        const barWidth = Math.max(2, (s.sensitivity / maxSens) * 100);
        const isPositive = s.deltaMargin > 0;
        const colour = isPositive ? 'var(--link-active)' : 'var(--link-broken)';

        row.innerHTML = `
            <span class="bm-tornado-label">${s.label}</span>
            <div class="bm-tornado-bar-track">
                <div class="bm-tornado-bar" style="width: ${barWidth}%; background: ${colour};"></div>
            </div>
            <span class="bm-tornado-value" style="color: ${colour};">${(s.deltaMargin * 100).toFixed(1)}%</span>
        `;
        _optimiserResults.appendChild(row);
    }

    const note = document.createElement('div');
    note.className = 'bm-opt-note';
    note.textContent = 'Values show gross margin change for a \u00b110% parameter swing.';
    _optimiserResults.appendChild(note);
}

function _showBreakevens() {
    if (!_optimiserResults) return;
    _optimiserResults.innerHTML = '';

    const breakevens = computeBreakevens();
    if (breakevens.length === 0) {
        _optimiserResults.innerHTML = '<div class="empty-state">No data to analyse.</div>';
        return;
    }

    const title = document.createElement('div');
    title.className = 'bm-opt-title';
    title.textContent = 'Breakeven Values (Margin = 0%)';
    _optimiserResults.appendChild(title);

    const list = document.createElement('div');
    list.className = 'bm-cost-list';

    for (const b of breakevens) {
        const row = document.createElement('div');
        row.className = 'bm-cost-row';

        if (b.reachable) {
            const diff = b.breakevenValue - b.currentValue;
            const arrow = diff > 0 ? '\u2191' : '\u2193';
            const cls = (b.dir > 0 && diff < 0) || (b.dir < 0 && diff > 0) ? 'bm-warning' : 'bm-positive';
            row.innerHTML = `
                <span>${b.label}</span>
                <span class="${cls}">${_formatParamValue(b.breakevenValue, b.unit)} ${arrow}</span>
            `;
        } else {
            row.innerHTML = `
                <span>${b.label}</span>
                <span style="color: var(--text-dim);">N/A</span>
            `;
        }
        list.appendChild(row);
    }
    _optimiserResults.appendChild(list);

    const note = document.createElement('div');
    note.className = 'bm-opt-note';
    note.textContent = 'Parameter value at which gross margin crosses 0%, all else equal. N/A = breakeven not reachable within parameter range.';
    _optimiserResults.appendChild(note);
}

function _showSuggestions() {
    if (!_optimiserResults) return;
    _optimiserResults.innerHTML = '';

    const targetMargin = _targetMarginPct / 100;

    const suggestions = suggestViableConfig({ targetMargin });
    if (suggestions.length === 0) {
        const results = getResults();
        const currentPct = results ? (results.grossMargin * 100).toFixed(1) : '?';
        _optimiserResults.innerHTML = `<div class="bm-opt-note" style="color: var(--link-active);">Already near target margin (current: ${currentPct}%, target: ${_targetMarginPct}%).</div>`;
        return;
    }

    const title = document.createElement('div');
    title.className = 'bm-opt-title';
    title.textContent = 'Suggested Adjustments';
    _optimiserResults.appendChild(title);

    const list = document.createElement('div');
    list.className = 'bm-cost-list';

    for (const s of suggestions) {
        const row = document.createElement('div');
        row.className = 'bm-cost-row';
        const arrow = s.to > s.from ? '\u2191' : '\u2193';
        row.innerHTML = `
            <span>${s.label}</span>
            <span>${_formatParamValue(s.from, s.unit)} \u2192 <strong>${_formatParamValue(s.to, s.unit)}</strong> ${arrow}</span>
        `;
        list.appendChild(row);
    }
    _optimiserResults.appendChild(list);

    // Expected outcome
    const lastSugg = suggestions[suggestions.length - 1];
    const outcomeDiv = document.createElement('div');
    outcomeDiv.className = 'bm-opt-note';
    outcomeDiv.textContent = `Expected margin: ${(lastSugg.marginAfter * 100).toFixed(1)}% (target: ${_targetMarginPct}%)`;
    outcomeDiv.style.color = lastSugg.marginAfter >= targetMargin ? 'var(--link-active)' : 'var(--link-marginal)';
    _optimiserResults.appendChild(outcomeDiv);

    // Apply button
    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-sm btn-primary';
    applyBtn.textContent = 'Apply Suggestions';
    applyBtn.style.marginTop = '6px';
    applyBtn.addEventListener('click', () => {
        applySuggestions(suggestions);
        if (_onApplySuggestions) _onApplySuggestions(suggestions);
        _optimiserResults.innerHTML = '<div class="bm-opt-note" style="color: var(--link-active);">\u2713 Suggestions applied. Slider values updated.</div>';
    });
    _optimiserResults.appendChild(applyBtn);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attach a tooltip attribute to a control row element.
 */
function _tip(el, key) {
    const text = TOOLTIPS[key];
    if (text) el.setAttribute('data-tooltip', text);
    return el;
}

function _marginClass(margin) {
    if (margin >= 0.20) return 'bm-positive';
    if (margin > 0) return 'bm-warning';
    return 'bm-negative';
}

function _formatMoney(value) {
    if (value === Infinity || value === -Infinity) return '∞';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + 'K';
    return sign + '$' + abs.toFixed(0);
}

function _formatNumber(value) {
    if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    return value.toFixed(0);
}

function _formatParamValue(value, unit) {
    // Show reasonable precision based on magnitude
    let str;
    if (value >= 1000) str = value.toFixed(0);
    else if (value >= 10) str = value.toFixed(1);
    else if (value >= 1) str = value.toFixed(2);
    else str = value.toFixed(3);
    return unit ? str + ' ' + unit : str;
}
