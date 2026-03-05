/**
 * networkGraph.js — Network topology state, adjacency tracking, basic network metrics.
 */

import { getAllNodes, getNode } from './nodeManager.js';

/**
 * Compute summary network metrics.
 *
 * @param {Array} links — array of link data objects from linkManager
 * @returns {object} metrics
 */
export function computeNetworkMetrics(links) {
    const nodes = getAllNodes();
    let activeLinks = 0;
    let marginalLinks = 0;
    let brokenLinks = 0;
    let inactiveLinks = 0;
    let totalPowerGenerated = 0;
    let totalPowerConsumed = 0;
    let totalPowerDelivered = 0;

    for (const link of links) {
        switch (link.status) {
            case 'ACTIVE':   activeLinks++;   break;
            case 'MARGINAL': marginalLinks++; break;
            case 'BROKEN':   brokenLinks++;   break;
            case 'INACTIVE': inactiveLinks++; break;
        }
        if (link.budget) {
            totalPowerDelivered += link.budget.rxPower_kW || 0;
        }
    }

    for (const node of nodes) {
        if (node.type === 'GROUND_SOURCE') {
            totalPowerGenerated += node.params.totalAvailablePower_kW || 0;
        }
        if (node.params.requiredPower_kW) {
            totalPowerConsumed += node.params.requiredPower_kW;
        }
    }

    return {
        nodeCount: nodes.length,
        linkCount: links.length,
        activeLinks,
        marginalLinks,
        brokenLinks,
        inactiveLinks,
        powerGenerated: totalPowerGenerated,
        powerConsumed: totalPowerConsumed,
        powerDelivered: totalPowerDelivered,
    };
}

/**
 * Build an adjacency map from links.
 * @param {Array} links
 * @returns {Map<string, string[]>} nodeId → [connected nodeIds]
 */
export function buildAdjacency(links) {
    const adj = new Map();
    for (const link of links) {
        if (!adj.has(link.fromId)) adj.set(link.fromId, []);
        if (!adj.has(link.toId)) adj.set(link.toId, []);
        adj.get(link.fromId).push(link.toId);
        adj.get(link.toId).push(link.fromId);
    }
    return adj;
}

/**
 * BFS path finding.
 * @param {Map<string, string[]>} adj — adjacency map
 * @param {string} startId
 * @param {string} endId
 * @returns {string[]|null} path as array of node ids, or null if no path
 */
export function findPath(adj, startId, endId) {
    if (startId === endId) return [startId];

    const visited = new Set();
    const queue = [[startId]];
    visited.add(startId);

    while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];
        const neighbours = adj.get(current) || [];

        for (const next of neighbours) {
            if (visited.has(next)) continue;
            const newPath = [...path, next];
            if (next === endId) return newPath;
            visited.add(next);
            queue.push(newPath);
        }
    }

    return null;
}
