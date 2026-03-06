/**
 * linkInspector.js — Link budget display panel, shown on link click.
 */

import { getLink, removeLink, selectLink } from './linkManager.js';
import { getNode } from './nodeManager.js';
import { LINK_STATUS, BEAM_TYPES, MARGINAL_THRESHOLD_DB } from './constants.js';
import { createButton, createSectionTitle } from './uiPanel.js';
import { TOOLTIPS } from './tooltip.js';

const _panelEl = document.getElementById('panel-link-inspector');
const _bodyEl = document.getElementById('link-inspector-body');

/**
 * Show the link inspector for a link. Pass null to hide.
 * @param {string|null} linkId
 */
export function showLinkInspector(linkId) {
    if (!linkId) {
        _panelEl.style.display = 'none';
        return;
    }

    const link = getLink(linkId);
    if (!link) {
        _panelEl.style.display = 'none';
        return;
    }

    _panelEl.style.display = '';
    _bodyEl.innerHTML = '';

    const fromNode = getNode(link.fromId);
    const toNode = getNode(link.toId);

    // Link header
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom: 8px; font-size: 12px;';
    header.innerHTML = `
        <strong>${fromNode ? fromNode.name : '?'}</strong>
        <span style="color: var(--text-dim);"> → </span>
        <strong>${toNode ? toNode.name : '?'}</strong>
    `;
    _bodyEl.appendChild(header);

    // Status badge
    const statusDef = LINK_STATUS[link.status] || LINK_STATUS.INACTIVE;
    const badge = document.createElement('div');
    badge.style.cssText = `
        display: inline-block; padding: 2px 8px; border-radius: 3px;
        font-size: 11px; font-weight: 600; margin-bottom: 8px;
        background: ${statusDef.colourHex}22; color: ${statusDef.colourHex};
        border: 1px solid ${statusDef.colourHex}44;
    `;
    badge.textContent = statusDef.label;
    _bodyEl.appendChild(badge);

    if (!link.budget) {
        const noData = document.createElement('div');
        noData.className = 'empty-state';
        noData.textContent = 'No budget data available.';
        _bodyEl.appendChild(noData);
    } else {
        const b = link.budget;

        // Budget table
        _bodyEl.appendChild(createSectionTitle('Link Budget'));
        const table = document.createElement('table');
        table.className = 'budget-table';

        // [label, value, tooltipKey]
        const rows = [
            ['Transmit power', `${b.txPower_kW.toFixed(2)} kW (${b.txPower_dBW.toFixed(1)} dBW)`, 'budget-tx-power'],
            ['Tx efficiency', `${(b.txEfficiency * 100).toFixed(1)}% (${b.efficiencyLoss_dB.toFixed(2)} dB)`, 'budget-tx-efficiency'],
            ['Wavelength', `${b.wavelength_nm.toFixed(0)} nm`, 'budget-wavelength'],
            ['Link distance', `${b.distance_km.toFixed(1)} km`, 'budget-distance'],
            ['Beam divergence', `${b.divergence_mrad.toFixed(3)} mrad`, 'budget-divergence'],
            ['Beam \u2300 at Rx', `${b.beamDiameterAtRx_m.toFixed(2)} m`, 'budget-beam-diameter'],
            ['Tx aperture', `${b.txApertureDiameter_m.toFixed(3)} m`, 'budget-tx-aperture'],
            ['Rx aperture', `${b.rxApertureDiameter_m.toFixed(3)} m`, 'budget-rx-aperture'],
            ['Capture fraction', `${(b.rxCaptureFraction * 100).toFixed(4)}% (${b.captureLoss_dB.toFixed(2)} dB)`, 'budget-capture'],
            ['Pointing loss', `${b.pointingLoss_dB.toFixed(2)} dB`, 'budget-pointing'],
            ['Atmospheric loss', `${b.atmosphericLoss_dB.toFixed(2)} dB`, 'budget-atm-loss'],
            ['Total path loss', `${b.totalPathLoss_dB.toFixed(2)} dB`, 'budget-path-loss'],
            ['Elevation angle', `${b.elevAngle_deg.toFixed(1)}\u00b0`, 'budget-elevation'],
            ['LOS clear', b.losOk ? 'Yes' : 'BLOCKED', 'budget-los'],
        ];

        for (const [label, value, tipKey] of rows) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${label}</td><td>${value}</td>`;
            if (TOOLTIPS[tipKey]) tr.setAttribute('data-tooltip', TOOLTIPS[tipKey]);
            if (label === 'LOS clear' && !b.losOk) {
                tr.children[1].style.color = 'var(--link-broken)';
                tr.children[1].style.fontWeight = '700';
            }
            table.appendChild(tr);
        }

        // Result rows: [label, value, cssClass, tooltipKey]
        const resultRows = [
            ['Received power', `${b.rxPower_kW.toFixed(4)} kW (${b.rxPower_dBW.toFixed(1)} dBW)`, 'budget-result', 'budget-rx-power'],
        ];

        if (b.requiredPower_kW > 0) {
            resultRows.push([
                'Required power',
                `${b.requiredPower_kW.toFixed(2)} kW (${b.requiredPower_dBW.toFixed(1)} dBW)`,
                '',
                'budget-required',
            ]);

            const marginClass = b.marginOverRequired_dB < 0
                ? 'budget-negative'
                : b.marginOverRequired_dB < MARGINAL_THRESHOLD_DB
                    ? 'budget-marginal'
                    : 'budget-positive';

            resultRows.push([
                'Link margin',
                `${b.marginOverRequired_dB.toFixed(2)} dB`,
                'budget-result ' + marginClass,
                'budget-margin',
            ]);
        }

        for (const [label, value, cls, tipKey] of resultRows) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${label}</td><td class="${cls}">${value}</td>`;
            if (tipKey && TOOLTIPS[tipKey]) tr.setAttribute('data-tooltip', TOOLTIPS[tipKey]);
            table.appendChild(tr);
        }

        _bodyEl.appendChild(table);
    }

    // Delete button
    const btnRow = document.createElement('div');
    btnRow.style.marginTop = '12px';
    btnRow.appendChild(createButton('Delete Link', 'btn-danger', () => {
        removeLink(linkId);
    }));
    _bodyEl.appendChild(btnRow);
}
