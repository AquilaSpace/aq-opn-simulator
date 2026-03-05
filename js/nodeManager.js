/**
 * nodeManager.js — Node CRUD, Three.js mesh creation per type, add/remove/select/drag.
 * Owns all node state. Other modules read from here, never own node state.
 */

import * as THREE from 'three';
import {
    NODE_TYPES, EARTH_RADIUS, MOON_RADIUS, MOON_DISTANCE,
    latLonAltToScene, sceneToLatLonAlt, SCENE_SCALE_KM,
} from './constants.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} id → node data object */
const _nodes = new Map();

/** Currently selected node id, or null */
let _selectedId = null;

/** The Three.js group that holds all node meshes */
let _nodeGroup = null;

/** Reference to the scene (set via init) */
let _scene = null;

/** Camera reference for billboard labels */
let _camera = null;

/** Counter for unique ids */
let _nextId = 1;

/** Callbacks */
const _listeners = {
    select: [],
    change: [],
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialise the node manager.
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 */
export function initNodeManager(scene, camera) {
    _scene = scene;
    _camera = camera;
    _nodeGroup = new THREE.Group();
    _nodeGroup.name = 'nodes';
    _scene.add(_nodeGroup);
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

export function onNodeSelect(fn) { _listeners.select.push(fn); }
export function onNodeChange(fn) { _listeners.change.push(fn); }

function _emitSelect(id) { _listeners.select.forEach(fn => fn(id)); }
function _emitChange() { _listeners.change.forEach(fn => fn()); }

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new node.
 * @param {object} opts
 * @param {string} opts.type         — key from NODE_TYPES
 * @param {string} [opts.name]       — display name
 * @param {object} [opts.position]   — { lat_deg, lon_deg, alt_km } or { x, y, z } in scene units
 * @param {object} [opts.params]     — override default parameters
 * @param {string} [opts.id]         — force a specific id (for import)
 * @returns {object} the created node data
 */
export function createNode(opts) {
    const typeDef = NODE_TYPES[opts.type];
    if (!typeDef) throw new Error('Unknown node type: ' + opts.type);

    const id = opts.id || ('node-' + String(_nextId++).padStart(3, '0'));
    // Ensure _nextId stays ahead of imported ids
    if (opts.id) {
        const num = parseInt(opts.id.replace(/\D/g, ''), 10);
        if (num >= _nextId) _nextId = num + 1;
    }

    // Position
    let scenePos;
    if (opts.position && opts.position.lat_deg !== undefined) {
        scenePos = latLonAltToScene(opts.position.lat_deg, opts.position.lon_deg, opts.position.alt_km || 0);
    } else if (opts.position && opts.position.x !== undefined) {
        scenePos = { x: opts.position.x, y: opts.position.y, z: opts.position.z };
    } else {
        scenePos = { x: 0, y: EARTH_RADIUS + 0.5, z: 0 };
    }

    const params = Object.assign({}, typeDef.defaults, opts.params || {});

    const node = {
        id,
        type: opts.type,
        name: opts.name || typeDef.label + ' ' + id.replace('node-', '#'),
        position: opts.position || { lat_deg: 0, lon_deg: 0, alt_km: 0 },
        scenePos,
        params,
        mesh: null,
        label: null,
    };

    // Create 3D mesh
    node.mesh = _createMesh(node);
    node.mesh.position.set(scenePos.x, scenePos.y, scenePos.z);
    node.mesh.userData.nodeId = id;
    _nodeGroup.add(node.mesh);

    // Create billboard label
    node.label = _createLabel(node);
    node.mesh.add(node.label);

    _nodes.set(id, node);
    _emitChange();
    return node;
}

/**
 * Remove a node by id.
 */
export function removeNode(id) {
    const node = _nodes.get(id);
    if (!node) return;

    _nodeGroup.remove(node.mesh);
    _disposeMesh(node.mesh);
    _nodes.delete(id);

    if (_selectedId === id) {
        _selectedId = null;
        _emitSelect(null);
    }
    _emitChange();
}

/**
 * Select a node. Pass null to deselect.
 */
export function selectNode(id) {
    // Deselect previous
    if (_selectedId) {
        const prev = _nodes.get(_selectedId);
        if (prev && prev.mesh) {
            _setMeshHighlight(prev.mesh, false);
        }
    }

    _selectedId = id;

    if (id) {
        const node = _nodes.get(id);
        if (node && node.mesh) {
            _setMeshHighlight(node.mesh, true);
        }
    }

    _emitSelect(id);
}

/**
 * Get the currently selected node id.
 */
export function getSelectedNodeId() { return _selectedId; }

/**
 * Get a node by id.
 * @returns {object|undefined}
 */
export function getNode(id) { return _nodes.get(id); }

/**
 * Get all nodes as an array.
 */
export function getAllNodes() { return Array.from(_nodes.values()); }

/**
 * Get node count.
 */
export function getNodeCount() { return _nodes.size; }

/**
 * Update a node's parameters.
 */
export function updateNodeParams(id, newParams) {
    const node = _nodes.get(id);
    if (!node) return;
    Object.assign(node.params, newParams);
    _emitChange();
}

/**
 * Update a node's name.
 */
export function updateNodeName(id, name) {
    const node = _nodes.get(id);
    if (!node) return;
    node.name = name;
    _updateLabel(node);
    _emitChange();
}

/**
 * Update a node's type.
 */
export function updateNodeType(id, newType) {
    const node = _nodes.get(id);
    if (!node || !NODE_TYPES[newType]) return;

    node.type = newType;
    // Rebuild mesh
    _nodeGroup.remove(node.mesh);
    _disposeMesh(node.mesh);

    node.mesh = _createMesh(node);
    node.mesh.position.set(node.scenePos.x, node.scenePos.y, node.scenePos.z);
    node.mesh.userData.nodeId = id;
    _nodeGroup.add(node.mesh);

    node.label = _createLabel(node);
    node.mesh.add(node.label);

    if (_selectedId === id) {
        _setMeshHighlight(node.mesh, true);
    }

    _emitChange();
}

/**
 * Move a node to a new scene position.
 */
export function moveNode(id, scenePos) {
    const node = _nodes.get(id);
    if (!node) return;

    node.scenePos = { x: scenePos.x, y: scenePos.y, z: scenePos.z };
    node.mesh.position.set(scenePos.x, scenePos.y, scenePos.z);

    // Update lat/lon from scene pos if ground type
    if (node.type.startsWith('GROUND_') || node.type === 'MOBILE_NODE') {
        node.position = sceneToLatLonAlt(scenePos.x, scenePos.y, scenePos.z);
    }

    _emitChange();
}

/**
 * Update node scene position from its orbital elements (called by time controller).
 */
export function setNodeScenePosition(id, x, y, z) {
    const node = _nodes.get(id);
    if (!node) return;
    node.scenePos = { x, y, z };
    node.mesh.position.set(x, y, z);
}

/**
 * Get the Three.js group containing all node meshes (for raycasting).
 */
export function getNodeGroup() { return _nodeGroup; }

/**
 * Update billboard labels to face the camera. Call each frame.
 */
export function updateLabels() {
    if (!_camera) return;
    for (const node of _nodes.values()) {
        if (node.label) {
            node.label.lookAt(_camera.position);

            // Fade label with distance
            const dist = _camera.position.distanceTo(node.mesh.position);
            const opacity = Math.max(0, Math.min(1, 1 - (dist - 5) / 80));
            node.label.visible = opacity > 0.05;
            if (node.label.children[0]) {
                node.label.children[0].material.opacity = opacity;
            }
        }
    }
}

/**
 * Clear all nodes.
 */
export function clearAllNodes() {
    for (const id of Array.from(_nodes.keys())) {
        removeNode(id);
    }
    _nextId = 1;
}

// ---------------------------------------------------------------------------
// 3D Mesh creation per node type
// ---------------------------------------------------------------------------

function _createMesh(node) {
    const typeDef = NODE_TYPES[node.type];
    const colour = typeDef.colour;
    const group = new THREE.Group();

    const matOpts = {
        color: colour,
        emissive: colour,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.9,
    };

    switch (typeDef.shape) {
        case 'cone_sphere': {
            // Ground source: upward cone + sphere on top
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(0.12, 0.25, 8),
                new THREE.MeshPhongMaterial(matOpts)
            );
            cone.position.y = 0.125;
            group.add(cone);

            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(0.08, 12, 12),
                new THREE.MeshPhongMaterial(matOpts)
            );
            sphere.position.y = 0.3;
            group.add(sphere);
            break;
        }
        case 'octahedron': {
            const mesh = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.15),
                new THREE.MeshPhongMaterial(matOpts)
            );
            mesh.position.y = 0.15;
            group.add(mesh);
            break;
        }
        case 'cube': {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.18, 0.18, 0.18),
                new THREE.MeshPhongMaterial(matOpts)
            );
            mesh.position.y = 0.09;
            group.add(mesh);
            break;
        }
        case 'sphere_ring': {
            // Orbital relay: sphere + ring torus
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 16, 16),
                new THREE.MeshPhongMaterial(matOpts)
            );
            group.add(sphere);

            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.2, 0.02, 8, 32),
                new THREE.MeshPhongMaterial({ ...matOpts, emissiveIntensity: 0.5 })
            );
            ring.rotation.x = Math.PI / 2;
            group.add(ring);
            break;
        }
        case 'cylinder': {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.12, 0.2, 12),
                new THREE.MeshPhongMaterial(matOpts)
            );
            mesh.position.y = 0.1;
            group.add(mesh);
            break;
        }
        case 'arrow_cone': {
            // Mobile node: small cone (pointing forward)
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(0.08, 0.2, 8),
                new THREE.MeshPhongMaterial(matOpts)
            );
            cone.rotation.z = -Math.PI / 2;
            cone.position.y = 0.1;
            group.add(cone);
            break;
        }
        default: {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 12, 12),
                new THREE.MeshPhongMaterial(matOpts)
            );
            group.add(mesh);
        }
    }

    // Add a point light for glow effect
    const glow = new THREE.PointLight(colour, 0.5, 2);
    glow.position.y = 0.15;
    group.add(glow);

    return group;
}

function _createLabel(node) {
    const group = new THREE.Group();
    group.position.y = 0.45;

    // Create text sprite
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 64);

    // Background
    ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
    ctx.beginPath();
    ctx.roundRect(2, 2, 252, 60, 6);
    ctx.fill();

    // Border
    const typeDef = NODE_TYPES[node.type];
    ctx.strokeStyle = typeDef.colourHex;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(2, 2, 252, 60, 6);
    ctx.stroke();

    // Name text
    ctx.fillStyle = '#e0e0e8';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Truncate name if needed
    let name = node.name;
    if (name.length > 18) name = name.slice(0, 16) + '…';
    ctx.fillText(name, 128, 22);

    // Type text
    ctx.fillStyle = typeDef.colourHex;
    ctx.font = '13px sans-serif';
    ctx.fillText(typeDef.label, 128, 46);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.8, 0.2, 1);
    group.add(sprite);

    return group;
}

function _updateLabel(node) {
    if (node.label) {
        node.mesh.remove(node.label);
        _disposeLabel(node.label);
    }
    node.label = _createLabel(node);
    node.mesh.add(node.label);
}

function _setMeshHighlight(meshGroup, highlight) {
    meshGroup.traverse(child => {
        if (child.isMesh && child.material) {
            child.material.emissiveIntensity = highlight ? 0.7 : 0.3;
        }
    });
}

function _disposeMesh(meshGroup) {
    meshGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
        }
    });
}

function _disposeLabel(labelGroup) {
    labelGroup.traverse(child => {
        if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
        }
    });
}
