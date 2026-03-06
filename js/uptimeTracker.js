/**
 * uptimeTracker.js — Tracks power reception uptime for receiver nodes.
 * Samples link status at each physics tick and computes the fraction of
 * simulation time each receiver node has had at least one active incoming link.
 */

import { getAllNodes } from './nodeManager.js';
import { getAllLinks } from './linkManager.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Map<string, { activeSamples: number, totalSamples: number }>} */
const _uptimeData = new Map();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sample all receiver nodes at the current simulation instant.
 * Call this at each physics tick (e.g. 10 Hz).
 */
export function sampleUptime() {
    const nodes = getAllNodes();
    const links = getAllLinks();

    // Build a set of node IDs that currently have at least one active incoming link
    const poweredNodes = new Set();
    for (const link of links) {
        if (link.status === 'ACTIVE' || link.status === 'MARGINAL') {
            poweredNodes.add(link.toId);
        }
    }

    // Update counters for all receiver nodes (customers + lunar nodes)
    for (const node of nodes) {
        if (node.type === 'GROUND_CUSTOMER' || node.type === 'ORBITAL_CUSTOMER' || node.type === 'LUNAR_NODE') {
            let entry = _uptimeData.get(node.id);
            if (!entry) {
                entry = { activeSamples: 0, totalSamples: 0 };
                _uptimeData.set(node.id, entry);
            }
            entry.totalSamples++;
            if (poweredNodes.has(node.id)) {
                entry.activeSamples++;
            }
        }
    }
}

/**
 * Get the uptime percentage for a node.
 * @param {string} nodeId
 * @returns {number|null} uptime as a percentage (0–100), or null if no data
 */
export function getUptime(nodeId) {
    const entry = _uptimeData.get(nodeId);
    if (!entry || entry.totalSamples === 0) return null;
    return (entry.activeSamples / entry.totalSamples) * 100;
}

/**
 * Get a formatted uptime string for a node.
 * @param {string} nodeId
 * @returns {string} e.g. "78.5%" or "—" if no data
 */
export function getUptimeString(nodeId) {
    const pct = getUptime(nodeId);
    if (pct === null) return '\u2014'; // em dash
    return pct.toFixed(1) + '%';
}

/**
 * Reset all uptime data (e.g. on time reset).
 */
export function resetUptime() {
    _uptimeData.clear();
}
