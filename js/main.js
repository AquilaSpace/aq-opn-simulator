/**
 * main.js — Scene setup, renderer, camera, orbit controls, render loop, orchestration.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    EARTH_RADIUS, CAMERA_PRESETS, NODE_TYPES,
    sceneToLatLonAlt, latLonAltToScene, SCENE_SCALE_KM, EARTH_RADIUS_KM,
} from './constants.js';
import { createEarth, createMoon, createGridOverlay } from './earth.js';
import { addLighting, createStarfield } from './sceneHelpers.js';
import { initCameraPresets, goToPreset, updateCameraAnimation, focusOn } from './cameraPresets.js';
import {
    initNodeManager, createNode, removeNode, selectNode,
    getSelectedNodeId, getNode, getAllNodes, getNodeGroup,
    moveNode, onNodeSelect, onNodeChange, updateLabels, getNodeCount,
} from './nodeManager.js';
import { showNodeEditor } from './nodeEditor.js';
import { updateNetworkStats } from './uiPanel.js';
import {
    initLinkManager, createLink, removeLink, selectLink, removeLinksForNode,
    getSelectedLinkId, getAllLinks, getLinkGroup, getLinkCount,
    setBeamType, setAtmCondition, recomputeAllLinks,
    onLinkSelect, onLinkChange, updateLinkAnimations,
} from './linkManager.js';
import { showLinkInspector } from './linkInspector.js';
import { computeNetworkMetrics } from './networkGraph.js';
import { initTimeController, updateTimeController } from './timeController.js';
import { autoSuggestRelays, acceptSuggestion } from './optimiser.js';
import { downloadJSON, importFromFile, exportScreenshot, importNetwork } from './serialisation.js';

// ---------------------------------------------------------------------------
// Scene, Camera, Renderer
// ---------------------------------------------------------------------------

const canvas = document.getElementById('viewport');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / canvas.clientHeight,
    0.01,
    2000
);
camera.position.set(0, 8, 25);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x0a0a0f, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Orbit controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = EARTH_RADIUS * 1.1;
controls.maxDistance = 600;
controls.target.set(0, 0, 0);
controls.update();

// ---------------------------------------------------------------------------
// Populate scene
// ---------------------------------------------------------------------------

// Lighting
addLighting(scene);

// Starfield
const stars = createStarfield();
scene.add(stars);

// Earth
const { mesh: earthMesh, atmosphere: earthAtmosphere } = createEarth();
scene.add(earthMesh);
scene.add(earthAtmosphere);

// Grid overlay (toggleable)
const gridOverlay = createGridOverlay();
scene.add(gridOverlay);
let gridVisible = true;

// Moon
const moonMesh = createMoon();
scene.add(moonMesh);

// Earth auto-rotate state
let autoRotate = true;
const earthRotateSpeed = 0.0003; // radians per frame

// ---------------------------------------------------------------------------
// Camera presets
// ---------------------------------------------------------------------------

initCameraPresets(camera, controls);

// ---------------------------------------------------------------------------
// Node manager
// ---------------------------------------------------------------------------

initNodeManager(scene, camera);

// Wire node deletion to remove connected links
const _origRemoveNode = removeNode;
// We patch via event listener instead
onNodeChange(() => {
    // When a node is removed, linkManager should clean up its links.
    // We handle this in the removeNode override below.
    updateNodeList();
    updateStats();
});

// Override removeNode to also remove links
const _removeNodeAndLinks = (id) => {
    removeLinksForNode(id);
    _origRemoveNode(id);
};

// Wire up node selection → editor panel + deselect link
onNodeSelect((nodeId) => {
    showNodeEditor(nodeId);
    if (nodeId) {
        selectLink(null); // Deselect link when node is selected
    }
    updateNodeList();
});

// ---------------------------------------------------------------------------
// Link manager
// ---------------------------------------------------------------------------

initLinkManager(scene);

onLinkSelect((linkId) => {
    showLinkInspector(linkId);
    if (linkId) {
        selectNode(null); // Deselect node when link is selected
    }
});

onLinkChange(() => {
    updateStats();
});

// ---------------------------------------------------------------------------
// Time controller
// ---------------------------------------------------------------------------

initTimeController(moonMesh);

// ---------------------------------------------------------------------------
// Export state for other modules
// ---------------------------------------------------------------------------

export { scene, camera, renderer, controls, canvas, earthMesh, moonMesh, gridOverlay };

export function getEarthMesh() { return earthMesh; }
export function getMoonMesh() { return moonMesh; }

// ---------------------------------------------------------------------------
// Link creation mode
// ---------------------------------------------------------------------------

let _linkCreationSource = null; // nodeId of source for link creation

function _startLinkCreation(nodeId) {
    _linkCreationSource = nodeId;
    canvas.style.cursor = 'crosshair';
}

function _completeLinkCreation(targetNodeId) {
    if (_linkCreationSource && targetNodeId && _linkCreationSource !== targetNodeId) {
        createLink(_linkCreationSource, targetNodeId);
    }
    _linkCreationSource = null;
    canvas.style.cursor = '';
}

function _cancelLinkCreation() {
    _linkCreationSource = null;
    canvas.style.cursor = '';
}

// ---------------------------------------------------------------------------
// Raycasting & interaction
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let _isDragging = false;
let _dragNode = null;
const _dragPlane = new THREE.Plane();
const _dragIntersect = new THREE.Vector3();
let _mouseDownPos = new THREE.Vector2();

// Context menu for adding nodes
let _addMenuEl = null;

function _createAddMenu() {
    _addMenuEl = document.createElement('div');
    _addMenuEl.id = 'add-node-menu';
    _addMenuEl.style.cssText = `
        position: fixed; display: none; z-index: 200;
        background: var(--panel-bg, #1a1a2e); border: 1px solid var(--panel-border, #2a2a3e);
        border-radius: 6px; padding: 4px 0; min-width: 160px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    `;

    for (const [key, typeDef] of Object.entries(NODE_TYPES)) {
        if (key === 'ORBITAL_RELAY') continue;
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 6px 12px; cursor: pointer; font-size: 12px;
            color: var(--text, #e0e0e8); display: flex; align-items: center; gap: 8px;
            transition: background 0.1s;
        `;
        item.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${typeDef.colourHex};display:inline-block;"></span>${typeDef.label}`;
        item.addEventListener('mouseenter', () => { item.style.background = 'rgba(74,158,255,0.15)'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
        item.addEventListener('click', () => {
            _addNodeAtPending(key);
            _hideAddMenu();
        });
        _addMenuEl.appendChild(item);
    }

    // Orbital relay
    const orbItem = document.createElement('div');
    orbItem.style.cssText = `
        padding: 6px 12px; cursor: pointer; font-size: 12px;
        color: var(--text, #e0e0e8); display: flex; align-items: center; gap: 8px;
        border-top: 1px solid var(--panel-border, #2a2a3e); margin-top: 2px;
        transition: background 0.1s;
    `;
    orbItem.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${NODE_TYPES.ORBITAL_RELAY.colourHex};display:inline-block;"></span>Orbital Relay`;
    orbItem.addEventListener('mouseenter', () => { orbItem.style.background = 'rgba(74,158,255,0.15)'; });
    orbItem.addEventListener('mouseleave', () => { orbItem.style.background = 'transparent'; });
    orbItem.addEventListener('click', () => {
        _addNodeAtPending('ORBITAL_RELAY');
        _hideAddMenu();
    });
    _addMenuEl.appendChild(orbItem);

    document.body.appendChild(_addMenuEl);
}

let _pendingAddPos = null;

function _showAddMenu(screenX, screenY, position) {
    if (!_addMenuEl) _createAddMenu();
    _pendingAddPos = position;
    _addMenuEl.style.display = 'block';
    _addMenuEl.style.left = screenX + 'px';
    _addMenuEl.style.top = screenY + 'px';
}

function _hideAddMenu() {
    if (_addMenuEl) _addMenuEl.style.display = 'none';
    _pendingAddPos = null;
}

function _addNodeAtPending(type) {
    if (!_pendingAddPos) return;
    const node = createNode({
        type,
        position: _pendingAddPos,
    });
    selectNode(node.id);
}

function onMouseDown(event) {
    _mouseDownPos.set(event.clientX, event.clientY);
    _hideAddMenu();

    // Don't start drag if in link creation mode
    if (_linkCreationSource) return;

    const hit = _raycastNodes(event);
    if (hit && !event.shiftKey) {
        _isDragging = true;
        _dragNode = hit.nodeId;
        controls.enabled = false;

        const node = getNode(hit.nodeId);
        if (node) {
            const normal = new THREE.Vector3().subVectors(camera.position, node.mesh.position).normalize();
            _dragPlane.setFromNormalAndCoplanarPoint(normal, node.mesh.position);
        }
    }
}

function onMouseMove(event) {
    if (!_isDragging || !_dragNode) return;

    _updateMouse(event);
    raycaster.setFromCamera(mouse, camera);

    if (raycaster.ray.intersectPlane(_dragPlane, _dragIntersect)) {
        const node = getNode(_dragNode);
        if (!node) return;

        if (node.type.startsWith('GROUND_') || node.type === 'MOBILE_NODE') {
            const dir = _dragIntersect.clone().normalize();
            const alt_km = node.position.alt_km || 0;
            const R = (EARTH_RADIUS_KM + alt_km) / SCENE_SCALE_KM;
            _dragIntersect.copy(dir.multiplyScalar(R));
        }

        moveNode(_dragNode, _dragIntersect);
        recomputeAllLinks(); // Update links as node is dragged
    }
}

function onMouseUp(event) {
    const wasDragging = _isDragging;
    const dragDistance = _mouseDownPos.distanceTo(new THREE.Vector2(event.clientX, event.clientY));

    _isDragging = false;
    _dragNode = null;
    controls.enabled = true;

    if (wasDragging && dragDistance > 5) return;

    _updateMouse(event);

    // Shift+click on node → link creation
    if (event.shiftKey) {
        const nodeHit = _raycastNodes(event);
        if (nodeHit) {
            if (_linkCreationSource) {
                _completeLinkCreation(nodeHit.nodeId);
            } else {
                const selectedId = getSelectedNodeId();
                if (selectedId) {
                    // Create link from selected to shift-clicked node
                    createLink(selectedId, nodeHit.nodeId);
                } else {
                    // Start link creation from this node
                    _startLinkCreation(nodeHit.nodeId);
                }
            }
            return;
        }
        _cancelLinkCreation();
        return;
    }

    // Cancel link creation if clicking without shift
    if (_linkCreationSource) {
        _cancelLinkCreation();
    }

    // Node click
    const nodeHit = _raycastNodes(event);
    if (nodeHit) {
        selectNode(nodeHit.nodeId);
        return;
    }

    // Link click
    const linkHit = _raycastLinks(event);
    if (linkHit) {
        selectLink(linkHit.linkId);
        return;
    }

    // Earth surface click → add menu
    raycaster.setFromCamera(mouse, camera);
    const earthHits = raycaster.intersectObject(earthMesh);
    if (earthHits.length > 0) {
        const point = earthHits[0].point;
        const invMatrix = new THREE.Matrix4().copy(earthMesh.matrixWorld).invert();
        const localPoint = point.clone().applyMatrix4(invMatrix);
        const pos = sceneToLatLonAlt(localPoint.x, localPoint.y, localPoint.z);
        _showAddMenu(event.clientX, event.clientY, { lat_deg: pos.lat_deg, lon_deg: pos.lon_deg, alt_km: 0 });
        return;
    }

    // Empty space → deselect all
    selectNode(null);
    selectLink(null);
}

function onKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA') return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodeId = getSelectedNodeId();
        if (selectedNodeId) {
            _removeNodeAndLinks(selectedNodeId);
            return;
        }
        const selectedLinkId = getSelectedLinkId();
        if (selectedLinkId) {
            removeLink(selectedLinkId);
        }
    }

    if (event.key === 'Escape') {
        selectNode(null);
        selectLink(null);
        _cancelLinkCreation();
        _hideAddMenu();
    }
}

function _updateMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function _raycastNodes(event) {
    _updateMouse(event);
    raycaster.setFromCamera(mouse, camera);

    const nodeGroup = getNodeGroup();
    if (!nodeGroup) return null;

    const intersects = raycaster.intersectObjects(nodeGroup.children, true);
    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData.nodeId) {
            obj = obj.parent;
        }
        if (obj && obj.userData.nodeId) {
            return { nodeId: obj.userData.nodeId, point: intersects[0].point };
        }
    }
    return null;
}

function _raycastLinks(event) {
    _updateMouse(event);
    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Line = { threshold: 0.15 }; // Increase hit area for lines

    const linkGroup = getLinkGroup();
    if (!linkGroup) return null;

    const intersects = raycaster.intersectObjects(linkGroup.children, true);
    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData.linkId) {
            obj = obj.parent;
        }
        if (obj && obj.userData.linkId) {
            return { linkId: obj.userData.linkId };
        }
    }
    return null;
}

canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup', onMouseUp);
window.addEventListener('keydown', onKeyDown);
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); _hideAddMenu(); });
window.addEventListener('wheel', () => _hideAddMenu());

// ---------------------------------------------------------------------------
// Node list in sidebar
// ---------------------------------------------------------------------------

function updateNodeList() {
    const listEl = document.getElementById('node-list');
    if (!listEl) return;

    const nodes = getAllNodes();
    const selectedId = getSelectedNodeId();

    if (nodes.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No nodes yet. Click on the Earth to add one.</div>';
        return;
    }

    listEl.innerHTML = '';
    for (const node of nodes) {
        const typeDef = NODE_TYPES[node.type];
        const item = document.createElement('div');
        item.className = 'node-list-item' + (node.id === selectedId ? ' selected' : '');
        item.innerHTML = `
            <span class="node-colour-dot" style="background: ${typeDef.colourHex}"></span>
            <span class="node-name">${node.name}</span>
            <span class="node-type">${typeDef.label}</span>
        `;
        item.addEventListener('click', () => {
            selectNode(node.id);
            focusOn(new THREE.Vector3(node.scenePos.x, node.scenePos.y, node.scenePos.z));
        });
        listEl.appendChild(item);
    }
}

function updateStats() {
    const links = getAllLinks();
    const metrics = computeNetworkMetrics(links);
    updateNetworkStats(metrics);
}

// ---------------------------------------------------------------------------
// UI bindings
// ---------------------------------------------------------------------------

function setupUIBindings() {
    // Camera preset buttons
    document.querySelectorAll('[data-camera-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            goToPreset(btn.dataset.cameraPreset);
        });
    });

    // Auto-rotate toggle
    const rotateToggle = document.getElementById('auto-rotate');
    if (rotateToggle) {
        rotateToggle.checked = autoRotate;
        rotateToggle.addEventListener('change', () => {
            autoRotate = rotateToggle.checked;
        });
    }

    // Grid toggle
    const gridToggle = document.getElementById('grid-toggle');
    if (gridToggle) {
        gridToggle.checked = gridVisible;
        gridToggle.addEventListener('change', () => {
            gridVisible = gridToggle.checked;
            gridOverlay.visible = gridVisible;
        });
    }

    // Collapsible panels
    document.querySelectorAll('.panel-header').forEach(header => {
        header.addEventListener('click', () => {
            const panel = header.parentElement;
            panel.classList.toggle('collapsed');
        });
    });

    // Beam type selector
    const beamTypeEl = document.getElementById('beam-type');
    const customWlRow = document.getElementById('custom-wavelength-row');
    if (beamTypeEl) {
        beamTypeEl.addEventListener('change', () => {
            if (customWlRow) {
                customWlRow.style.display = beamTypeEl.value === 'CUSTOM' ? '' : 'none';
            }
            if (beamTypeEl.value !== 'CUSTOM') {
                setBeamType(beamTypeEl.value);
            }
        });
    }

    // Atmospheric condition selector
    const atmCondEl = document.getElementById('atm-condition');
    if (atmCondEl) {
        atmCondEl.addEventListener('change', () => {
            setAtmCondition(atmCondEl.value);
        });
    }

    // Header buttons: Import/Export/Screenshot
    const btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.addEventListener('click', downloadJSON);

    const btnImport = document.getElementById('btn-import');
    if (btnImport) btnImport.addEventListener('click', () => {
        importFromFile();
        // After import, update UI
        setTimeout(() => { updateNodeList(); updateStats(); }, 200);
    });

    const btnScreenshot = document.getElementById('btn-screenshot');
    if (btnScreenshot) btnScreenshot.addEventListener('click', () => {
        exportScreenshot(canvas, renderer, scene, camera);
    });

    // Optimiser button
    const btnOptimise = document.getElementById('btn-optimise');
    if (btnOptimise) {
        btnOptimise.disabled = false;
        btnOptimise.addEventListener('click', () => {
            const suggestions = autoSuggestRelays();
            if (suggestions.length === 0) {
                alert('No relay suggestions — either all customers are reachable directly, or no source/customer nodes exist.');
                return;
            }
            const accepted = confirm(
                `Optimiser suggests ${suggestions.length} relay(s):\n\n` +
                suggestions.map((s, i) => `${i + 1}. ${s.type} — ${s.reason}`).join('\n') +
                '\n\nAccept all suggestions?'
            );
            if (accepted) {
                for (const s of suggestions) {
                    acceptSuggestion(s);
                }
                updateNodeList();
                updateStats();
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------

function onResize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

window.addEventListener('resize', onResize);

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

let _lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = (now - _lastTime) / 1000;
    _lastTime = now;

    // Earth rotation
    if (autoRotate) {
        earthMesh.rotation.y += earthRotateSpeed;
        earthAtmosphere.rotation.y = earthMesh.rotation.y;
        gridOverlay.rotation.y = earthMesh.rotation.y;
    }

    // Camera animation
    updateCameraAnimation();

    // Update billboard labels
    updateLabels();

    // Update link particle animations
    updateLinkAnimations(dt);

    // Update time controller (orbital propagation)
    updateTimeController(dt);

    controls.update();
    renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

setupUIBindings();

// ---------------------------------------------------------------------------
// Demo scene (loaded on first visit)
// ---------------------------------------------------------------------------

function loadDemoScene() {
    const demoNetwork = {
        version: '1.0.0',
        metadata: {
            name: 'Demo Network',
            created: '2025-03-05T12:00:00Z',
            description: 'Earth-Moon optical power relay demonstration',
        },
        globalSettings: {
            beamType: 'YB_FIBRE',
            atmosphericCondition: 'clear',
            epoch: '2025-03-05T12:00:00Z',
        },
        nodes: [
            {
                id: 'node-001',
                type: 'GROUND_SOURCE',
                name: 'Sydney Solar Farm',
                position: { lat_deg: -33.86, lon_deg: 151.21, alt_km: 0 },
                params: {
                    transmitPower_kW: 50,
                    apertureDiameter_m: 0.5,
                    trackingAccuracy_mrad: 0.1,
                    transmitterEfficiency: 0.85,
                    totalAvailablePower_kW: 100,
                    outputBeams: 4,
                },
            },
            {
                id: 'node-002',
                type: 'GROUND_SOURCE',
                name: 'Mojave Power Station',
                position: { lat_deg: 35.05, lon_deg: -117.18, alt_km: 0 },
                params: {
                    transmitPower_kW: 100,
                    apertureDiameter_m: 0.6,
                    trackingAccuracy_mrad: 0.08,
                    transmitterEfficiency: 0.88,
                    totalAvailablePower_kW: 200,
                    outputBeams: 6,
                },
            },
            {
                id: 'node-003',
                type: 'GROUND_CUSTOMER',
                name: 'Pilbara Mine Site',
                position: { lat_deg: -22.3, lon_deg: 118.8, alt_km: 0 },
                params: {
                    requiredPower_kW: 20,
                    apertureDiameter_m: 0.6,
                    trackingAccuracy_mrad: 0.15,
                },
            },
            {
                id: 'node-004',
                type: 'GROUND_RELAY',
                name: 'Nullarbor Relay',
                position: { lat_deg: -31.0, lon_deg: 130.0, alt_km: 0 },
                params: {
                    transmitPower_kW: 40,
                    apertureDiameter_m: 0.4,
                    trackingAccuracy_mrad: 0.1,
                    transmitterEfficiency: 0.80,
                    receiveAperture_m: 0.5,
                    retransmitEfficiency: 0.75,
                    maxSimultaneousLinks: 4,
                },
            },
            {
                id: 'node-005',
                type: 'ORBITAL_RELAY',
                name: 'Pacific GEO Relay',
                position: { lat_deg: 0, lon_deg: -170, alt_km: 35786 },
                params: {
                    transmitPower_kW: 30,
                    apertureDiameter_m: 0.3,
                    trackingAccuracy_mrad: 0.05,
                    transmitterEfficiency: 0.80,
                    receiveAperture_m: 0.4,
                    retransmitEfficiency: 0.70,
                    maxSimultaneousLinks: 6,
                    orbitalElements: {
                        semiMajorAxis_km: 42164,
                        eccentricity: 0,
                        inclination_deg: 0,
                        raan_deg: 0,
                        argOfPerigee_deg: 0,
                        trueAnomaly_deg: 190,
                    },
                },
            },
            {
                id: 'node-006',
                type: 'GROUND_CUSTOMER',
                name: 'Tokyo Receiver',
                position: { lat_deg: 35.68, lon_deg: 139.69, alt_km: 0 },
                params: {
                    requiredPower_kW: 30,
                    apertureDiameter_m: 0.5,
                    trackingAccuracy_mrad: 0.12,
                },
            },
            {
                id: 'node-007',
                type: 'LUNAR_NODE',
                name: 'Shackleton Base',
                // Lunar south pole — positioned on Moon surface
                // Moon initial position is at (0, 0, 384.4) scene units
                // Shackleton is near lunar south pole, so offset in -Y from Moon centre
                position: { x: 0, y: -1.737, z: 384.4 },
                params: {
                    transmitPower_kW: 5,
                    apertureDiameter_m: 0.3,
                    trackingAccuracy_mrad: 0.2,
                    transmitterEfficiency: 0.80,
                    requiredPower_kW: 10,
                },
            },
        ],
        links: [
            { id: 'link-001', from: 'node-001', to: 'node-004', wavelength_nm: null },
            { id: 'link-002', from: 'node-004', to: 'node-003', wavelength_nm: null },
            { id: 'link-003', from: 'node-001', to: 'node-005', wavelength_nm: null },
            { id: 'link-004', from: 'node-005', to: 'node-002', wavelength_nm: null },
            { id: 'link-005', from: 'node-001', to: 'node-006', wavelength_nm: null },
            { id: 'link-006', from: 'node-002', to: 'node-005', wavelength_nm: null },
        ],
    };

    importNetwork(demoNetwork);
    updateNodeList();
    updateStats();
}

// Load demo scene
loadDemoScene();

animate();

console.log('Aquila OPN Simulator initialised.');
