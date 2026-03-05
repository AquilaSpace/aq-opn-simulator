/**
 * serialisation.js — JSON export/import of full network state, PNG screenshot.
 */

import { getAllNodes, createNode, clearAllNodes } from './nodeManager.js';
import {
    getAllLinks, createLink, clearAllLinks,
    getBeamTypeKey, getAtmConditionKey,
    setBeamType, setAtmCondition,
} from './linkManager.js';

/**
 * Export the current network as a JSON object.
 * @returns {object}
 */
export function exportNetwork() {
    const nodes = getAllNodes().map(n => ({
        id: n.id,
        type: n.type,
        name: n.name,
        position: n.position,
        params: { ...n.params },
    }));

    const links = getAllLinks().map(l => ({
        id: l.id,
        from: l.fromId,
        to: l.toId,
        wavelength_nm: l.wavelength_nm || null,
    }));

    return {
        version: '1.0.0',
        metadata: {
            name: 'OPN Network',
            created: new Date().toISOString(),
            description: '',
        },
        globalSettings: {
            beamType: getBeamTypeKey(),
            atmosphericCondition: getAtmConditionKey(),
            epoch: '2025-03-05T12:00:00Z',
        },
        nodes,
        links,
    };
}

/**
 * Import a network from a JSON object. Replaces current state.
 * @param {object} data
 */
export function importNetwork(data) {
    if (!data || !data.nodes) {
        console.warn('Invalid network data.');
        return;
    }

    // Clear existing
    clearAllLinks();
    clearAllNodes();

    // Apply global settings
    if (data.globalSettings) {
        if (data.globalSettings.beamType) {
            setBeamType(data.globalSettings.beamType);
            const el = document.getElementById('beam-type');
            if (el) el.value = data.globalSettings.beamType;
        }
        if (data.globalSettings.atmosphericCondition) {
            setAtmCondition(data.globalSettings.atmosphericCondition);
            const el = document.getElementById('atm-condition');
            if (el) el.value = data.globalSettings.atmosphericCondition;
        }
    }

    // Create nodes
    for (const nodeData of data.nodes) {
        createNode({
            id: nodeData.id,
            type: nodeData.type,
            name: nodeData.name,
            position: nodeData.position,
            params: nodeData.params,
        });
    }

    // Create links
    if (data.links) {
        for (const linkData of data.links) {
            createLink(linkData.from, linkData.to, {
                id: linkData.id,
                wavelength_nm: linkData.wavelength_nm,
            });
        }
    }
}

/**
 * Download JSON export.
 */
export function downloadJSON() {
    const data = exportNetwork();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'opn-network.json';
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Open file picker and import JSON.
 */
export function importFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                importNetwork(data);
            } catch (err) {
                console.error('Failed to parse network file:', err);
                alert('Failed to import: invalid JSON file.');
            }
        };
        reader.readAsText(file);
    });
    input.click();
}

/**
 * Export a screenshot of the viewport as PNG.
 * @param {HTMLCanvasElement} canvas — the Three.js canvas
 * @param {THREE.WebGLRenderer} renderer — the renderer (to force a render first)
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 */
export function exportScreenshot(canvas, renderer, scene, camera) {
    // Force a fresh render
    renderer.render(scene, camera);

    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'opn-screenshot.png';
        a.click();
        URL.revokeObjectURL(url);
    }, 'image/png');
}
