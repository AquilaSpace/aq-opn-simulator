/**
 * nodeEditor.js — Node property editor panel. Populates when a node is selected.
 */

import { NODE_TYPES, ORBITAL_PRESETS } from './constants.js';
import {
    getNode, updateNodeParams, updateNodeName, updateNodeType,
    removeNode, selectNode,
} from './nodeManager.js';
import {
    createSliderControl, createSelectControl, createTextControl,
    createButton, createSectionTitle,
} from './uiPanel.js';
import { getUptimeString } from './uptimeTracker.js';

const _panelEl = document.getElementById('panel-node-editor');
const _bodyEl = document.getElementById('node-editor-body');

/**
 * Show the node editor for the given node id. Pass null to hide.
 */
export function showNodeEditor(nodeId) {
    if (!nodeId) {
        _panelEl.style.display = 'none';
        return;
    }

    const node = getNode(nodeId);
    if (!node) {
        _panelEl.style.display = 'none';
        return;
    }

    _panelEl.style.display = '';
    _bodyEl.innerHTML = '';

    // Name
    _bodyEl.appendChild(createTextControl({
        label: 'Name',
        id: 'ne-name',
        value: node.name,
        onChange: (v) => updateNodeName(nodeId, v),
    }));

    // Type
    const typeOptions = Object.keys(NODE_TYPES).map(k => ({
        value: k,
        label: NODE_TYPES[k].label,
    }));
    _bodyEl.appendChild(createSelectControl({
        label: 'Type',
        id: 'ne-type',
        options: typeOptions,
        value: node.type,
        onChange: (v) => {
            updateNodeType(nodeId, v);
            showNodeEditor(nodeId); // Rebuild panel
        },
    }));

    // Position
    _bodyEl.appendChild(createSectionTitle('Position'));

    if (node.type.startsWith('GROUND_') || node.type === 'MOBILE_NODE' || node.type === 'LUNAR_NODE') {
        _bodyEl.appendChild(createSliderControl({
            label: 'Latitude',
            id: 'ne-lat',
            min: -90, max: 90, step: 0.1,
            value: node.position.lat_deg || 0,
            unit: '°',
            onChange: (v) => _updatePosition(nodeId, { lat_deg: v }),
        }));

        _bodyEl.appendChild(createSliderControl({
            label: 'Longitude',
            id: 'ne-lon',
            min: -180, max: 180, step: 0.1,
            value: node.position.lon_deg || 0,
            unit: '°',
            onChange: (v) => _updatePosition(nodeId, { lon_deg: v }),
        }));

        if (node.type === 'MOBILE_NODE') {
            _bodyEl.appendChild(createSliderControl({
                label: 'Altitude',
                id: 'ne-alt',
                min: 0, max: 50, step: 0.1,
                value: (node.position.alt_km || 0),
                unit: 'km',
                onChange: (v) => _updatePosition(nodeId, { alt_km: v }),
            }));
        }
    }

    // Orbital elements
    if (node.type === 'ORBITAL_RELAY' || node.type === 'ORBITAL_CUSTOMER') {
        _bodyEl.appendChild(createSectionTitle('Orbital Elements'));

        // Orbital preset selector
        const presetOptions = [{ value: '', label: '— Custom —' }];
        for (const [k, v] of Object.entries(ORBITAL_PRESETS)) {
            presetOptions.push({ value: k, label: v.label });
        }
        _bodyEl.appendChild(createSelectControl({
            label: 'Preset',
            id: 'ne-orbit-preset',
            options: presetOptions,
            value: '',
            onChange: (v) => {
                if (!v) return;
                const preset = ORBITAL_PRESETS[v];
                const oe = { ...preset };
                delete oe.label;
                updateNodeParams(nodeId, { orbitalElements: oe });
                showNodeEditor(nodeId);
            },
        }));

        const oe = node.params.orbitalElements || {};
        _bodyEl.appendChild(createSliderControl({
            label: 'Semi-major',
            id: 'ne-sma',
            min: 6571, max: 400000, step: 100,
            value: oe.semiMajorAxis_km || 42164,
            unit: 'km',
            onChange: (v) => _updateOE(nodeId, { semiMajorAxis_km: v }),
        }));

        _bodyEl.appendChild(createSliderControl({
            label: 'Eccentricity',
            id: 'ne-ecc',
            min: 0, max: 0.99, step: 0.01,
            value: oe.eccentricity || 0,
            onChange: (v) => _updateOE(nodeId, { eccentricity: v }),
        }));

        _bodyEl.appendChild(createSliderControl({
            label: 'Inclination',
            id: 'ne-inc',
            min: 0, max: 180, step: 0.1,
            value: oe.inclination_deg || 0,
            unit: '°',
            onChange: (v) => _updateOE(nodeId, { inclination_deg: v }),
        }));

        _bodyEl.appendChild(createSliderControl({
            label: 'RAAN',
            id: 'ne-raan',
            min: 0, max: 360, step: 0.1,
            value: oe.raan_deg || 0,
            unit: '°',
            onChange: (v) => _updateOE(nodeId, { raan_deg: v }),
        }));

        _bodyEl.appendChild(createSliderControl({
            label: 'Arg. Perigee',
            id: 'ne-aop',
            min: 0, max: 360, step: 0.1,
            value: oe.argOfPerigee_deg || 0,
            unit: '°',
            onChange: (v) => _updateOE(nodeId, { argOfPerigee_deg: v }),
        }));

        _bodyEl.appendChild(createSliderControl({
            label: 'True Anomaly',
            id: 'ne-ta',
            min: 0, max: 360, step: 0.1,
            value: oe.trueAnomaly_deg || 0,
            unit: '°',
            onChange: (v) => _updateOE(nodeId, { trueAnomaly_deg: v }),
        }));
    }

    // Common power parameters
    _bodyEl.appendChild(createSectionTitle('Power'));

    if (node.type !== 'GROUND_CUSTOMER') {
        _bodyEl.appendChild(createSliderControl({
            label: 'Tx Power',
            id: 'ne-txpow',
            min: 0, max: 500, step: 1,
            value: node.params.transmitPower_kW || 0,
            unit: 'kW',
            onChange: (v) => updateNodeParams(nodeId, { transmitPower_kW: v }),
        }));

        _bodyEl.appendChild(createSliderControl({
            label: 'Tx Efficiency',
            id: 'ne-txeff',
            min: 0, max: 1, step: 0.01,
            value: node.params.transmitterEfficiency || 0.85,
            onChange: (v) => updateNodeParams(nodeId, { transmitterEfficiency: v }),
        }));
    }

    _bodyEl.appendChild(createSliderControl({
        label: 'Aperture',
        id: 'ne-ap',
        min: 0.01, max: 2.0, step: 0.01,
        value: node.params.apertureDiameter_m || 0.3,
        unit: 'm',
        onChange: (v) => updateNodeParams(nodeId, { apertureDiameter_m: v }),
    }));

    _bodyEl.appendChild(createSliderControl({
        label: 'Tracking',
        id: 'ne-track',
        min: 0.001, max: 5, step: 0.001,
        value: node.params.trackingAccuracy_mrad || 0.1,
        unit: 'mrad',
        onChange: (v) => updateNodeParams(nodeId, { trackingAccuracy_mrad: v }),
    }));

    // Source-specific
    if (node.type === 'GROUND_SOURCE') {
        _bodyEl.appendChild(createSectionTitle('Source'));
        _bodyEl.appendChild(createSliderControl({
            label: 'Total Power',
            id: 'ne-totpow',
            min: 0, max: 1000, step: 1,
            value: node.params.totalAvailablePower_kW || 100,
            unit: 'kW',
            onChange: (v) => updateNodeParams(nodeId, { totalAvailablePower_kW: v }),
        }));
        _bodyEl.appendChild(createSliderControl({
            label: 'Output Beams',
            id: 'ne-beams',
            min: 1, max: 20, step: 1,
            value: node.params.outputBeams || 4,
            onChange: (v) => updateNodeParams(nodeId, { outputBeams: v }),
        }));
    }

    // Relay-specific
    if (node.type === 'GROUND_RELAY' || node.type === 'ORBITAL_RELAY') {
        _bodyEl.appendChild(createSectionTitle('Relay'));
        _bodyEl.appendChild(createSliderControl({
            label: 'Rx Aperture',
            id: 'ne-rxap',
            min: 0.05, max: 2.0, step: 0.01,
            value: node.params.receiveAperture_m || 0.5,
            unit: 'm',
            onChange: (v) => updateNodeParams(nodeId, { receiveAperture_m: v }),
        }));
        _bodyEl.appendChild(createSliderControl({
            label: 'Re-tx Eff.',
            id: 'ne-rtxeff',
            min: 0, max: 1, step: 0.01,
            value: node.params.retransmitEfficiency || 0.75,
            onChange: (v) => updateNodeParams(nodeId, { retransmitEfficiency: v }),
        }));
        _bodyEl.appendChild(createSliderControl({
            label: 'Max Links',
            id: 'ne-maxlinks',
            min: 1, max: 20, step: 1,
            value: node.params.maxSimultaneousLinks || 4,
            onChange: (v) => updateNodeParams(nodeId, { maxSimultaneousLinks: v }),
        }));
    }

    // Customer-specific
    if (node.type === 'GROUND_CUSTOMER' || node.type === 'ORBITAL_CUSTOMER' || node.type === 'LUNAR_NODE') {
        _bodyEl.appendChild(createSectionTitle('Customer'));
        _bodyEl.appendChild(createSliderControl({
            label: 'Required',
            id: 'ne-reqpow',
            min: 0, max: 200, step: 0.5,
            value: node.params.requiredPower_kW || 20,
            unit: 'kW',
            onChange: (v) => updateNodeParams(nodeId, { requiredPower_kW: v }),
        }));

        // Uptime display (read-only, updated by time simulation)
        const uptimeRow = document.createElement('div');
        uptimeRow.className = 'control-row';
        uptimeRow.id = 'ne-uptime-row';
        const uptimeLabel = document.createElement('label');
        uptimeLabel.textContent = 'Uptime';
        uptimeRow.appendChild(uptimeLabel);
        const uptimeValue = document.createElement('span');
        uptimeValue.id = 'ne-uptime-value';
        uptimeValue.style.cssText = 'font-family: monospace; font-size: 12px; font-weight: 600; color: var(--text);';
        uptimeValue.textContent = getUptimeString(nodeId);
        uptimeRow.appendChild(uptimeValue);
        const uptimeHint = document.createElement('span');
        uptimeHint.style.cssText = 'font-size: 9px; color: var(--text-dim);';
        uptimeHint.textContent = '(play sim)';
        uptimeRow.appendChild(uptimeHint);
        _bodyEl.appendChild(uptimeRow);
    }

    // Mobile-specific
    if (node.type === 'MOBILE_NODE') {
        _bodyEl.appendChild(createSectionTitle('Mobile'));
        _bodyEl.appendChild(createSliderControl({
            label: 'Speed',
            id: 'ne-speed',
            min: 0, max: 500, step: 1,
            value: node.params.speed_ms || 50,
            unit: 'm/s',
            onChange: (v) => updateNodeParams(nodeId, { speed_ms: v }),
        }));
        _bodyEl.appendChild(createSliderControl({
            label: 'Heading',
            id: 'ne-heading',
            min: 0, max: 360, step: 1,
            value: node.params.heading_deg || 0,
            unit: '°',
            onChange: (v) => updateNodeParams(nodeId, { heading_deg: v }),
        }));
    }

    // Delete button
    const deleteRow = document.createElement('div');
    deleteRow.style.marginTop = '12px';
    deleteRow.appendChild(createButton('Delete Node', 'btn-danger', () => {
        removeNode(nodeId);
    }));
    _bodyEl.appendChild(deleteRow);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _updatePosition(nodeId, changes) {
    const node = getNode(nodeId);
    if (!node) return;
    Object.assign(node.position, changes);

    const pos = _latLonAltToScene(
        node.position.lat_deg,
        node.position.lon_deg,
        node.position.alt_km || 0
    );
    node.scenePos = pos;
    node.mesh.position.set(pos.x, pos.y, pos.z);
}

function _latLonAltToScene(lat_deg, lon_deg, alt_km) {
    // Inline to avoid circular dep (constants has no deps)
    const EARTH_RADIUS_KM = 6371;
    const SCENE_SCALE_KM = 1000;
    const lat = lat_deg * Math.PI / 180;
    const lon = lon_deg * Math.PI / 180;
    const R = (EARTH_RADIUS_KM + alt_km) / SCENE_SCALE_KM;
    return {
        x: R * Math.cos(lat) * Math.sin(lon),
        y: R * Math.sin(lat),
        z: R * Math.cos(lat) * Math.cos(lon),
    };
}

function _updateOE(nodeId, changes) {
    const node = getNode(nodeId);
    if (!node) return;
    const oe = node.params.orbitalElements || {};
    Object.assign(oe, changes);
    updateNodeParams(nodeId, { orbitalElements: oe });
}
