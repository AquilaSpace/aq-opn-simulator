/**
 * linkManager.js — Power link management: create/remove links, beam line rendering,
 * link state, colour-coded status, animated energy flow particles.
 * Owns all link state.
 */

import * as THREE from 'three';
import { LINK_STATUS, BEAM_TYPES } from './constants.js';
import { getNode, getAllNodes, onNodeChange } from './nodeManager.js';
import { computeFullLinkBudget } from './linkBudget.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} id → link data */
const _links = new Map();

/** Currently selected link id, or null */
let _selectedLinkId = null;

/** Three.js group for all link visuals */
let _linkGroup = null;

/** Scene reference */
let _scene = null;

/** Global beam/atm settings */
let _beamTypeKey = 'YB_FIBRE';
let _atmConditionKey = 'clear';

/** Counter for unique ids */
let _nextLinkId = 1;

/** Callbacks */
const _listeners = {
    select: [],
    change: [],
};

/** Animation time */
let _animTime = 0;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialise the link manager.
 * @param {THREE.Scene} scene
 */
export function initLinkManager(scene) {
    _scene = scene;
    _linkGroup = new THREE.Group();
    _linkGroup.name = 'links';
    _scene.add(_linkGroup);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function onLinkSelect(fn) { _listeners.select.push(fn); }
export function onLinkChange(fn) { _listeners.change.push(fn); }

function _emitSelect(id) { _listeners.select.forEach(fn => fn(id)); }
function _emitChange() { _listeners.change.forEach(fn => fn()); }

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function setBeamType(key) { _beamTypeKey = key; recomputeAllLinks(); }
export function setAtmCondition(key) { _atmConditionKey = key; recomputeAllLinks(); }
export function getBeamTypeKey() { return _beamTypeKey; }
export function getAtmConditionKey() { return _atmConditionKey; }

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a link between two nodes.
 * @param {string} fromId
 * @param {string} toId
 * @param {object} [opts] — { wavelength_nm, id }
 * @returns {object|null} link data, or null if invalid
 */
export function createLink(fromId, toId, opts = {}) {
    if (fromId === toId) return null;
    if (!getNode(fromId) || !getNode(toId)) return null;

    // Check for duplicate
    for (const link of _links.values()) {
        if (link.fromId === fromId && link.toId === toId) return null;
    }

    const id = opts.id || ('link-' + String(_nextLinkId++).padStart(3, '0'));
    if (opts.id) {
        const num = parseInt(opts.id.replace(/\D/g, ''), 10);
        if (num >= _nextLinkId) _nextLinkId = num + 1;
    }

    const link = {
        id,
        fromId,
        toId,
        wavelength_nm: opts.wavelength_nm || null,
        status: 'INACTIVE',
        budget: null,
        mesh: null,
        particles: null,
    };

    // Compute budget
    link.budget = computeFullLinkBudget(link, _beamTypeKey, _atmConditionKey);
    if (link.budget) link.status = link.budget.status;

    // Create visuals
    _createLinkVisuals(link);

    _links.set(id, link);
    _emitChange();
    return link;
}

/**
 * Remove a link by id.
 */
export function removeLink(id) {
    const link = _links.get(id);
    if (!link) return;

    _disposeLinkVisuals(link);
    _links.delete(id);

    if (_selectedLinkId === id) {
        _selectedLinkId = null;
        _emitSelect(null);
    }
    _emitChange();
}

/**
 * Remove all links connected to a node.
 */
export function removeLinksForNode(nodeId) {
    const toRemove = [];
    for (const [id, link] of _links) {
        if (link.fromId === nodeId || link.toId === nodeId) {
            toRemove.push(id);
        }
    }
    for (const id of toRemove) {
        removeLink(id);
    }
}

/**
 * Select a link. Pass null to deselect.
 */
export function selectLink(id) {
    _selectedLinkId = id;
    _emitSelect(id);
}

/**
 * Get the currently selected link id.
 */
export function getSelectedLinkId() { return _selectedLinkId; }

/**
 * Get a link by id.
 */
export function getLink(id) { return _links.get(id); }

/**
 * Get all links as array.
 */
export function getAllLinks() { return Array.from(_links.values()); }

/**
 * Get link count.
 */
export function getLinkCount() { return _links.size; }

/**
 * Clear all links.
 */
export function clearAllLinks() {
    for (const id of Array.from(_links.keys())) {
        removeLink(id);
    }
    _nextLinkId = 1;
}

/**
 * Get the link group for raycasting.
 */
export function getLinkGroup() { return _linkGroup; }

// ---------------------------------------------------------------------------
// Recompute
// ---------------------------------------------------------------------------

/**
 * Recompute all link budgets and update visuals.
 */
export function recomputeAllLinks() {
    for (const link of _links.values()) {
        link.budget = computeFullLinkBudget(link, _beamTypeKey, _atmConditionKey);
        if (link.budget) link.status = link.budget.status;
        else link.status = 'BROKEN';
        _updateLinkVisuals(link);
    }
    _emitChange();
}

// ---------------------------------------------------------------------------
// Visuals
// ---------------------------------------------------------------------------

function _createLinkVisuals(link) {
    const fromNode = getNode(link.fromId);
    const toNode = getNode(link.toId);
    if (!fromNode || !toNode) return;

    const group = new THREE.Group();
    group.userData.linkId = link.id;

    // Beam line — use a tube for thickness with glow
    const points = [
        new THREE.Vector3(fromNode.scenePos.x, fromNode.scenePos.y, fromNode.scenePos.z),
        new THREE.Vector3(toNode.scenePos.x, toNode.scenePos.y, toNode.scenePos.z),
    ];

    // Main beam line
    const statusDef = LINK_STATUS[link.status] || LINK_STATUS.INACTIVE;
    const beamColour = _getBeamColour(link);
    const linkLength = points[0].distanceTo(points[1]);

    // Only show beam visuals when link is actively transmitting
    const showBeam = link.status === 'ACTIVE' || link.status === 'MARGINAL';

    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({
        color: statusDef.colour,
        transparent: true,
        opacity: 0.7,
        linewidth: 1,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.name = 'beamLine';
    line.visible = showBeam;
    group.add(line);

    // Glow line (wider, more transparent; brighter for cislunar)
    const glowOpacity = linkLength > 50 ? 0.35 : 0.15;
    const glowMaterial = new THREE.LineBasicMaterial({
        color: beamColour,
        transparent: true,
        opacity: glowOpacity,
        linewidth: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const glowLine = new THREE.Line(lineGeometry.clone(), glowMaterial);
    glowLine.name = 'glowLine';
    glowLine.visible = showBeam;
    group.add(glowLine);

    // Scale particle count and size for long-range (cislunar) links
    const isCislunar = linkLength > 50; // > 50,000 km
    const particleCount = isCislunar ? 24 : 12;
    const particleSize = isCislunar ? 0.4 : 0.08;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMaterial = new THREE.PointsMaterial({
        color: beamColour,
        size: particleSize,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.name = 'particles';
    particles.visible = showBeam;
    group.add(particles);

    // Direction arrow (small cone at midpoint)
    const mid = new THREE.Vector3().lerpVectors(points[0], points[1], 0.5);
    const dir = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    const arrowSize = linkLength > 50 ? 0.3 : 0.04;
    const arrowGeo = new THREE.ConeGeometry(arrowSize, arrowSize * 3, 6);
    const arrowMat = new THREE.MeshBasicMaterial({
        color: statusDef.colour,
        transparent: true,
        opacity: 0.6,
    });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.copy(mid);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    arrow.name = 'arrow';
    arrow.visible = showBeam;
    group.add(arrow);

    // Invisible cylinder for reliable click detection
    const hitRadius = Math.max(0.08, linkLength * 0.003);
    const hitGeo = new THREE.CylinderGeometry(hitRadius, hitRadius, linkLength, 6, 1);
    const hitMat = new THREE.MeshBasicMaterial({
        visible: false,
        transparent: true,
        opacity: 0,
    });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.copy(mid);
    hitMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    hitMesh.name = 'hitTarget';
    hitMesh.raycast = THREE.Mesh.prototype.raycast; // Ensure raycast works even when invisible
    group.add(hitMesh);

    _linkGroup.add(group);
    link.mesh = group;
}

function _updateLinkVisuals(link) {
    if (!link.mesh) return;

    const fromNode = getNode(link.fromId);
    const toNode = getNode(link.toId);
    if (!fromNode || !toNode) return;

    const from = new THREE.Vector3(fromNode.scenePos.x, fromNode.scenePos.y, fromNode.scenePos.z);
    const to = new THREE.Vector3(toNode.scenePos.x, toNode.scenePos.y, toNode.scenePos.z);

    const statusDef = LINK_STATUS[link.status] || LINK_STATUS.INACTIVE;
    const beamColour = _getBeamColour(link);
    // Hide laser visuals entirely for broken/inactive links
    const showBeam = link.status === 'ACTIVE' || link.status === 'MARGINAL';

    link.mesh.traverse(child => {
        if (child.isLine && child.name === 'beamLine') {
            child.geometry.setFromPoints([from, to]);
            child.visible = showBeam;
            if (showBeam) {
                child.material.color.setHex(statusDef.colour);
                child.material.opacity = 0.7;
            }
        }
        if (child.isLine && child.name === 'glowLine') {
            child.geometry.setFromPoints([from, to]);
            child.visible = showBeam;
            if (showBeam) {
                child.material.color.setHex(beamColour);
                const linkLen = from.distanceTo(to);
                child.material.opacity = linkLen > 50 ? 0.35 : 0.15;
            }
        }
        if (child.name === 'arrow') {
            const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
            const dir = new THREE.Vector3().subVectors(to, from).normalize();
            child.position.copy(mid);
            child.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            child.visible = showBeam;
            if (showBeam) {
                child.material.color.setHex(statusDef.colour);
                child.material.opacity = 0.6;
            }
        }
        if (child.isPoints && child.name === 'particles') {
            child.visible = showBeam;
            if (showBeam) {
                child.material.color.setHex(beamColour);
                child.material.opacity = 0.8;
                const linkLen = from.distanceTo(to);
                child.material.size = linkLen > 50 ? 0.4 : 0.08;
            }
        }
        if (child.isMesh && child.name === 'hitTarget') {
            // Hit target always stays for click detection
            const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
            const dir = new THREE.Vector3().subVectors(to, from).normalize();
            const linkLength = from.distanceTo(to);
            child.position.copy(mid);
            child.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            child.geometry.dispose();
            const hitRadius = Math.max(0.08, linkLength * 0.003);
            child.geometry = new THREE.CylinderGeometry(hitRadius, hitRadius, linkLength, 6, 1);
        }
    });
}

function _disposeLinkVisuals(link) {
    if (!link.mesh) return;
    _linkGroup.remove(link.mesh);
    link.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    link.mesh = null;
}

function _getBeamColour(link) {
    // Per-link wavelength override
    if (link.wavelength_nm) {
        for (const bt of Object.values(BEAM_TYPES)) {
            if (bt.wavelength_nm === link.wavelength_nm) return bt.visColour;
        }
        return 0xff6622; // Default
    }
    const beam = BEAM_TYPES[_beamTypeKey];
    return beam ? beam.visColour : 0xff6622;
}

// ---------------------------------------------------------------------------
// Animation update (call each frame)
// ---------------------------------------------------------------------------

/**
 * Update particle animation along beam lines.
 * @param {number} dt — delta time in seconds
 */
export function updateLinkAnimations(dt) {
    _animTime += dt;

    for (const link of _links.values()) {
        if (!link.mesh) continue;
        // Only animate particles for visible (active/marginal) links
        if (link.status === 'INACTIVE' || link.status === 'BROKEN') continue;

        const fromNode = getNode(link.fromId);
        const toNode = getNode(link.toId);
        if (!fromNode || !toNode) continue;

        const from = new THREE.Vector3(fromNode.scenePos.x, fromNode.scenePos.y, fromNode.scenePos.z);
        const to = new THREE.Vector3(toNode.scenePos.x, toNode.scenePos.y, toNode.scenePos.z);

        link.mesh.traverse(child => {
            if (child.isPoints && child.name === 'particles') {
                const posAttr = child.geometry.getAttribute('position');
                const count = posAttr.count;

                for (let i = 0; i < count; i++) {
                    // Each particle has a different phase offset
                    const t = ((_animTime * 0.5 + i / count) % 1);
                    const pos = new THREE.Vector3().lerpVectors(from, to, t);
                    posAttr.setXYZ(i, pos.x, pos.y, pos.z);
                }
                posAttr.needsUpdate = true;
            }
        });
    }
}
