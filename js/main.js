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
import { initTimeController, updateTimeController, onTimeTick, isPlaying, setPlaying, setSpeed, resetTime, getSimTime } from './timeController.js';
import { initOrbitTrails } from './orbitalMechanics.js';
import { getUptime, getUptimeString, resetUptime } from './uptimeTracker.js';
import { autoSuggestRelays, acceptSuggestion } from './optimiser.js';
import { downloadJSON, importFromFile, exportScreenshot, importNetwork } from './serialisation.js';
import { initTerrestrial, updateTerrestrial } from './terrestrial.js';

// ---------------------------------------------------------------------------
// Scene, Camera, Renderer
// ---------------------------------------------------------------------------

const canvas = document.getElementById('viewport');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / canvas.clientHeight,
    0.001,
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
controls.minDistance = EARTH_RADIUS * 1.001; // Allow close-to-surface zoom
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

// Earth-Moon corridor indicator (dashed line for cislunar visualisation)
const corridorMaterial = new THREE.LineDashedMaterial({
    color: 0x334466,
    transparent: true,
    opacity: 0.3,
    dashSize: 2,
    gapSize: 1,
    depthWrite: false,
});
const corridorGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    moonMesh.position.clone(),
]);
const corridorLine = new THREE.Line(corridorGeometry, corridorMaterial);
corridorLine.computeLineDistances();
corridorLine.name = 'earth-moon-corridor';
scene.add(corridorLine);

// Update corridor line when Moon moves (called from render loop)
function updateCorridorLine() {
    const positions = corridorLine.geometry.attributes.position;
    positions.setXYZ(1, moonMesh.position.x, moonMesh.position.y, moonMesh.position.z);
    positions.needsUpdate = true;
    corridorLine.computeLineDistances();
}


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
    updateNodeList();
    updateStats();
    if (_currentView === 'dashboard') updateDashboardHUD();
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
    updateLinkList();
    if (linkId) {
        selectNode(null); // Deselect node when link is selected
    }
});

onLinkChange(() => {
    updateStats();
    updateLinkList();
    if (_currentView === 'dashboard') updateDashboardHUD();
});

// ---------------------------------------------------------------------------
// Time controller
// ---------------------------------------------------------------------------

initTimeController(moonMesh);

// Update uptime display in node editor when sim ticks
onTimeTick(() => {
    const uptimeEl = document.getElementById('ne-uptime-value');
    if (uptimeEl) {
        const selectedId = getSelectedNodeId();
        if (selectedId) {
            uptimeEl.textContent = getUptimeString(selectedId);
        }
    }
});

// ---------------------------------------------------------------------------
// Orbit trail rendering
// ---------------------------------------------------------------------------

initOrbitTrails(scene);

// ---------------------------------------------------------------------------
// Terrestrial detail
// ---------------------------------------------------------------------------

initTerrestrial(scene, camera, controls);

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
        // Use world-space intersection point directly (sceneToLatLonAlt works in world space)
        const point = earthHits[0].point;
        const pos = sceneToLatLonAlt(point.x, point.y, point.z);
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

    const linkGroup = getLinkGroup();
    if (!linkGroup) return null;

    // Raycast against all children (invisible hitTarget cylinders will catch clicks)
    const intersects = raycaster.intersectObjects(linkGroup.children, true);
    for (const hit of intersects) {
        // Walk up to find the link group with linkId
        let obj = hit.object;
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
        const isReceiver = node.type === 'GROUND_CUSTOMER' || node.type === 'ORBITAL_CUSTOMER' || node.type === 'LUNAR_NODE';
        const uptimeStr = isReceiver ? getUptimeString(node.id) : '';
        const uptimeHtml = uptimeStr && uptimeStr !== '\u2014' ? `<span class="node-uptime" title="Power uptime">${uptimeStr}</span>` : '';
        const item = document.createElement('div');
        item.className = 'node-list-item' + (node.id === selectedId ? ' selected' : '');
        item.innerHTML = `
            <span class="node-colour-dot" style="background: ${typeDef.colourHex}"></span>
            <span class="node-name">${node.name}</span>
            ${uptimeHtml}
            <span class="node-type">${typeDef.label}</span>
        `;
        item.addEventListener('click', () => {
            selectNode(node.id);
            focusOn(new THREE.Vector3(node.scenePos.x, node.scenePos.y, node.scenePos.z));
        });
        listEl.appendChild(item);
    }
}

function updateLinkList() {
    const listEl = document.getElementById('link-list');
    if (!listEl) return;

    const links = getAllLinks();
    const selectedLinkId = getSelectedLinkId();

    if (links.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No links yet. Shift+click nodes to connect.</div>';
        return;
    }

    listEl.innerHTML = '';
    for (const link of links) {
        const fromNode = getNode(link.fromId);
        const toNode = getNode(link.toId);
        const fromName = fromNode ? fromNode.name : '?';
        const toName = toNode ? toNode.name : '?';

        const statusColour = {
            ACTIVE: '#00ff44', MARGINAL: '#ffaa00',
            BROKEN: '#ff3344', INACTIVE: '#666688',
        }[link.status] || '#666688';

        const powerStr = link.budget
            ? (link.budget.rxPower_kW >= 1
                ? link.budget.rxPower_kW.toFixed(2) + ' kW'
                : (link.budget.rxPower_W >= 0.01
                    ? link.budget.rxPower_W.toFixed(1) + ' W'
                    : link.budget.rxPower_W.toExponential(1) + ' W'))
            : '';

        const item = document.createElement('div');
        item.className = 'link-list-item' + (link.id === selectedLinkId ? ' selected' : '');
        item.innerHTML = `
            <span class="link-status-dot" style="background: ${statusColour}"></span>
            <span class="link-names">${fromName}<span class="link-arrow"> → </span>${toName}</span>
            <span class="link-power">${powerStr}</span>
        `;
        item.addEventListener('click', () => {
            selectLink(link.id);
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
    // Populate node type legend
    const legendEl = document.getElementById('node-type-legend');
    if (legendEl) {
        for (const [key, typeDef] of Object.entries(NODE_TYPES)) {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `<span class="legend-colour legend-dot" style="background: ${typeDef.colourHex};"></span><span>${typeDef.label}</span>`;
            legendEl.appendChild(item);
        }
    }

    // Camera preset buttons
    document.querySelectorAll('[data-camera-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            goToPreset(btn.dataset.cameraPreset);
        });
    });

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
        setTimeout(() => { updateNodeList(); updateLinkList(); updateStats(); }, 200);
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
    // In dashboard mode the viewport-container is position:fixed full-screen,
    // but canvas.clientWidth can be stale. Use window dimensions directly.
    const w = _currentView === 'dashboard' ? window.innerWidth : canvas.clientWidth;
    const h = _currentView === 'dashboard' ? window.innerHeight : canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

window.addEventListener('resize', onResize);

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

let _lastTime = performance.now();
let _currentView = 'engineer';

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = (now - _lastTime) / 1000;
    _lastTime = now;

    updateCameraAnimation();
    updateLabels();
    updateLinkAnimations(dt);
    updateTimeController(dt);
    updateCorridorLine();
    updateTerrestrial();

    // Dashboard revenue ticking (only when dashboard is active and playing)
    if (_currentView === 'dashboard' && isPlaying()) {
        updateDashboardRevenue();
        updateDashboardHUD();
    }

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
        // Parameters sized for GEO-distance optical power beaming:
        // 5 m apertures, ~100 nrad tracking, MW-class Tx power → 10s of kW delivered.
        nodes: [
            {
                id: 'node-001',
                type: 'GROUND_SOURCE',
                name: 'Sydney Solar Farm',
                position: { lat_deg: -33.86, lon_deg: 151.21, alt_km: 0 },
                params: {
                    transmitPower_kW: 1000,
                    apertureDiameter_m: 5.0,
                    trackingAccuracy_mrad: 0.0001,
                    transmitterEfficiency: 0.90,
                    totalAvailablePower_kW: 2000,
                    outputBeams: 4,
                },
            },
            {
                id: 'node-002',
                type: 'GROUND_SOURCE',
                name: 'Mojave Power Station',
                position: { lat_deg: 35.05, lon_deg: -117.18, alt_km: 0 },
                params: {
                    transmitPower_kW: 1200,
                    apertureDiameter_m: 5.0,
                    trackingAccuracy_mrad: 0.0001,
                    transmitterEfficiency: 0.90,
                    totalAvailablePower_kW: 3000,
                    outputBeams: 6,
                },
            },
            {
                id: 'node-003',
                type: 'GROUND_CUSTOMER',
                name: 'Pilbara Mine Site',
                position: { lat_deg: -22.3, lon_deg: 118.8, alt_km: 0 },
                params: {
                    requiredPower_kW: 10,
                    apertureDiameter_m: 5.0,
                    trackingAccuracy_mrad: 0.0001,
                },
            },
            {
                id: 'node-004',
                type: 'ORBITAL_RELAY',
                name: 'Indian Ocean GEO Relay',
                position: { lat_deg: 0, lon_deg: 105, alt_km: 35786 },
                params: {
                    transmitPower_kW: 500,
                    apertureDiameter_m: 5.0,
                    trackingAccuracy_mrad: 0.0001,
                    transmitterEfficiency: 0.90,
                    receiveAperture_m: 5.0,
                    retransmitEfficiency: 0.80,
                    maxSimultaneousLinks: 6,
                    orbitalElements: {
                        semiMajorAxis_km: 42164,
                        eccentricity: 0,
                        inclination_deg: 0,
                        raan_deg: 0,
                        argOfPerigee_deg: 0,
                        trueAnomaly_deg: 105,
                    },
                },
            },
            {
                id: 'node-005',
                type: 'ORBITAL_RELAY',
                name: 'Pacific GEO Relay',
                position: { lat_deg: 0, lon_deg: -170, alt_km: 35786 },
                params: {
                    transmitPower_kW: 500,
                    apertureDiameter_m: 5.0,
                    trackingAccuracy_mrad: 0.0001,
                    transmitterEfficiency: 0.90,
                    receiveAperture_m: 5.0,
                    retransmitEfficiency: 0.80,
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
                    requiredPower_kW: 10,
                    apertureDiameter_m: 5.0,
                    trackingAccuracy_mrad: 0.0001,
                },
            },
            {
                id: 'node-007',
                type: 'ORBITAL_CUSTOMER',
                name: 'LEO Science Platform',
                position: { lat_deg: 0, lon_deg: 120, alt_km: 400 },
                params: {
                    requiredPower_kW: 5,
                    apertureDiameter_m: 3.0,
                    trackingAccuracy_mrad: 0.0001,
                    orbitalElements: {
                        semiMajorAxis_km: 6771,
                        eccentricity: 0,
                        inclination_deg: 51.6,
                        raan_deg: 0,
                        argOfPerigee_deg: 0,
                        trueAnomaly_deg: 120,
                    },
                },
            },
            {
                id: 'node-008',
                type: 'LUNAR_NODE',
                name: 'Shackleton Base',
                // Lunar south pole — positioned on Moon surface
                // Moon initial position is at (0, 0, 384.4) scene units
                position: { x: 0, y: -1.737, z: 384.4 },
                params: {
                    transmitPower_kW: 50,
                    apertureDiameter_m: 3.0,
                    trackingAccuracy_mrad: 0.0001,
                    transmitterEfficiency: 0.85,
                    requiredPower_kW: 5,
                },
            },
        ],
        links: [
            // Sydney → Indian Ocean GEO Relay → Pilbara (via GEO)
            { id: 'link-001', from: 'node-001', to: 'node-004', wavelength_nm: null },
            { id: 'link-002', from: 'node-004', to: 'node-003', wavelength_nm: null },
            // Indian Ocean GEO Relay → Tokyo (downlink from GEO)
            { id: 'link-003', from: 'node-004', to: 'node-006', wavelength_nm: null },
            // Mojave → Pacific GEO Relay
            { id: 'link-004', from: 'node-002', to: 'node-005', wavelength_nm: null },
            // Pacific GEO Relay → LEO Science Platform (orbital-to-orbital)
            { id: 'link-005', from: 'node-005', to: 'node-007', wavelength_nm: null },
        ],
    };

    importNetwork(demoNetwork);
    updateNodeList();
    updateLinkList();
    updateStats();
}

// ---------------------------------------------------------------------------
// Dashboard view — shared state, auto-connect, revenue model
// ---------------------------------------------------------------------------

const REVENUE_PER_15MIN = 250;
let _totalRevenue = 0;
let _lastRevenueTick = 0;
const REVENUE_INTERVAL_S = 900;

/** Switch between engineer and dashboard views */
function switchView(view) {
    _currentView = view;
    document.body.classList.toggle('dashboard-view', view === 'dashboard');
    const hud = document.getElementById('dashboard-hud');
    if (hud) hud.style.display = view === 'dashboard' ? '' : 'none';

    // Update the header toggle button text
    const switchBtn = document.getElementById('btn-switch-view');
    if (switchBtn) switchBtn.textContent = view === 'dashboard' ? 'Engineer View' : 'Customer View';

    if (view === 'dashboard') {
        updateDashboardHUD();
    }

    // Trigger resize so canvas fills the new layout
    requestAnimationFrame(() => onResize());
}

/** Random lat/lon biased toward mid-latitudes */
function _randomLatLon() {
    const lat = (Math.random() - 0.5) * 120;
    const lon = (Math.random() - 0.5) * 360;
    return { lat_deg: lat, lon_deg: lon };
}

/** Random GEO longitude */
function _randomGeoLon() {
    return (Math.random() - 0.5) * 360;
}

/** Find nearest node of a given type to a position */
function _findNearest(pos, filterFn) {
    const candidates = getAllNodes().filter(filterFn);
    if (candidates.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
        const dx = c.scenePos.x - pos.x;
        const dy = c.scenePos.y - pos.y;
        const dz = c.scenePos.z - pos.z;
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist < bestDist) { bestDist = dist; best = c; }
    }
    return best;
}

/** Auto-connect all unconnected nodes — sources→relays, relays→customers */
function dashboardAutoConnect() {
    const nodes = getAllNodes();
    const links = getAllLinks();
    const existingPairs = new Set(links.map(l => l.fromId + '→' + l.toId));

    const sources = nodes.filter(n => n.type === 'GROUND_SOURCE');
    const relays = nodes.filter(n => n.type === 'ORBITAL_RELAY');
    const customers = nodes.filter(n =>
        n.type === 'GROUND_CUSTOMER' || n.type === 'ORBITAL_CUSTOMER' || n.type === 'LUNAR_NODE'
    );

    // Connect every source to nearest relay (if not already connected)
    for (const source of sources) {
        const relay = _findNearest(source.scenePos, n => n.type === 'ORBITAL_RELAY');
        if (relay && !existingPairs.has(source.id + '→' + relay.id)) {
            createLink(source.id, relay.id);
            existingPairs.add(source.id + '→' + relay.id);
        }
    }

    // Connect every customer to nearest relay (if no incoming link exists)
    for (const customer of customers) {
        const hasIncoming = getAllLinks().some(l => l.toId === customer.id);
        if (hasIncoming) continue;

        const relay = _findNearest(customer.scenePos, n => n.type === 'ORBITAL_RELAY');
        if (relay) {
            // Ensure this relay has an incoming source link
            const relayHasIncoming = getAllLinks().some(l => l.toId === relay.id);
            if (!relayHasIncoming) {
                const source = _findNearest(relay.scenePos, n => n.type === 'GROUND_SOURCE');
                if (source && !existingPairs.has(source.id + '→' + relay.id)) {
                    createLink(source.id, relay.id);
                    existingPairs.add(source.id + '→' + relay.id);
                }
            }
            if (!existingPairs.has(relay.id + '→' + customer.id)) {
                createLink(relay.id, customer.id);
                existingPairs.add(relay.id + '→' + customer.id);
            }
        } else {
            // No relay — try direct from nearest source
            const source = _findNearest(customer.scenePos, n => n.type === 'GROUND_SOURCE');
            if (source && !existingPairs.has(source.id + '→' + customer.id)) {
                createLink(source.id, customer.id);
                existingPairs.add(source.id + '→' + customer.id);
            }
        }
    }

    recomputeAllLinks();
}

function dashAddSource() {
    const { lat_deg, lon_deg } = _randomLatLon();
    const count = getAllNodes().filter(n => n.type === 'GROUND_SOURCE').length + 1;
    createNode({ type: 'GROUND_SOURCE', name: 'Power Station ' + count, position: { lat_deg, lon_deg, alt_km: 0 } });
    dashboardAutoConnect();
    updateDashboardHUD();
}

function dashAddRelay() {
    const lon = _randomGeoLon();
    const trueAnomaly = ((lon % 360) + 360) % 360;
    const count = getAllNodes().filter(n => n.type === 'ORBITAL_RELAY').length + 1;
    createNode({
        type: 'ORBITAL_RELAY',
        name: 'Relay SAT-' + count,
        position: { lat_deg: 0, lon_deg: lon, alt_km: 35786 },
        params: {
            orbitalElements: {
                semiMajorAxis_km: 42164, eccentricity: 0, inclination_deg: 0,
                raan_deg: 0, argOfPerigee_deg: 0, trueAnomaly_deg: trueAnomaly,
            },
        },
    });
    dashboardAutoConnect();
    updateDashboardHUD();
}

function dashAddGroundCustomer() {
    const { lat_deg, lon_deg } = _randomLatLon();
    const count = getAllNodes().filter(n =>
        n.type === 'GROUND_CUSTOMER' || n.type === 'ORBITAL_CUSTOMER' || n.type === 'LUNAR_NODE'
    ).length + 1;
    createNode({ type: 'GROUND_CUSTOMER', name: 'Ground Customer ' + count, position: { lat_deg, lon_deg, alt_km: 0 } });
    dashboardAutoConnect();
    updateDashboardHUD();
}

function dashAddOrbitalCustomer() {
    const lon = _randomGeoLon();
    const count = getAllNodes().filter(n =>
        n.type === 'GROUND_CUSTOMER' || n.type === 'ORBITAL_CUSTOMER' || n.type === 'LUNAR_NODE'
    ).length + 1;
    createNode({
        type: 'ORBITAL_CUSTOMER',
        name: 'Satellite Customer ' + count,
        position: { lat_deg: 0, lon_deg: lon, alt_km: 400 },
        params: {
            orbitalElements: {
                semiMajorAxis_km: 6771, eccentricity: 0, inclination_deg: 51.6,
                raan_deg: Math.random() * 360, argOfPerigee_deg: 0,
                trueAnomaly_deg: ((lon % 360) + 360) % 360,
            },
        },
    });
    dashboardAutoConnect();
    updateDashboardHUD();
}

function _formatRevenue(amount) {
    if (amount >= 1e6) return (amount / 1e6).toFixed(2) + 'M';
    if (amount >= 1e3) return (amount / 1e3).toFixed(1) + 'K';
    return amount.toFixed(0);
}

function updateDashboardRevenue() {
    const links = getAllLinks();
    const poweredCustomers = new Set();
    for (const link of links) {
        if (link.status === 'ACTIVE' || link.status === 'MARGINAL') {
            const toNode = getNode(link.toId);
            if (toNode && (toNode.type === 'GROUND_CUSTOMER' || toNode.type === 'ORBITAL_CUSTOMER' || toNode.type === 'LUNAR_NODE')) {
                poweredCustomers.add(link.toId);
            }
        }
    }
    const simTime = getSimTime();
    const elapsed = simTime - _lastRevenueTick;
    if (elapsed >= REVENUE_INTERVAL_S) {
        const intervals = Math.floor(elapsed / REVENUE_INTERVAL_S);
        _totalRevenue += poweredCustomers.size * REVENUE_PER_15MIN * intervals;
        _lastRevenueTick += intervals * REVENUE_INTERVAL_S;
    }
}

function updateDashboardHUD() {
    const nodes = getAllNodes();
    const links = getAllLinks();

    const el = (id) => document.getElementById(id);

    const sources = nodes.filter(n => n.type === 'GROUND_SOURCE').length;
    const relays = nodes.filter(n => n.type === 'ORBITAL_RELAY').length;
    const orbCustomers = nodes.filter(n => n.type === 'ORBITAL_CUSTOMER').length;
    const gndCustomers = nodes.filter(n =>
        n.type === 'GROUND_CUSTOMER' || n.type === 'LUNAR_NODE'
    ).length;
    const activeLinks = links.filter(l => l.status === 'ACTIVE' || l.status === 'MARGINAL').length;

    if (el('dash-stat-sources')) el('dash-stat-sources').textContent = sources;
    if (el('dash-stat-relays')) el('dash-stat-relays').textContent = relays;
    if (el('dash-stat-orbital-customers')) el('dash-stat-orbital-customers').textContent = orbCustomers;
    if (el('dash-stat-ground-customers')) el('dash-stat-ground-customers').textContent = gndCustomers;
    if (el('dash-stat-links-active')) el('dash-stat-links-active').textContent = activeLinks;

    // Total delivered power
    let totalPower_W = 0;
    for (const link of links) {
        if (link.budget && (link.status === 'ACTIVE' || link.status === 'MARGINAL')) {
            totalPower_W += link.budget.rxPower_W || 0;
        }
    }
    const powerStr = totalPower_W >= 1000
        ? (totalPower_W / 1000).toFixed(1) + ' kW'
        : totalPower_W.toFixed(1) + ' W';
    if (el('dash-stat-power')) el('dash-stat-power').textContent = powerStr;

    // Revenue
    if (el('dash-stat-revenue')) el('dash-stat-revenue').textContent = '$' + _formatRevenue(_totalRevenue);

    // Uptime
    const customerNodes = nodes.filter(n =>
        n.type === 'GROUND_CUSTOMER' || n.type === 'ORBITAL_CUSTOMER' || n.type === 'LUNAR_NODE'
    );
    let avgUptime = null;
    if (customerNodes.length > 0) {
        let sum = 0, count = 0;
        for (const c of customerNodes) {
            const u = getUptime(c.id);
            if (u !== null) { sum += u; count++; }
        }
        if (count > 0) avgUptime = sum / count;
    }
    if (el('dash-stat-uptime')) {
        el('dash-stat-uptime').textContent = avgUptime !== null ? avgUptime.toFixed(1) + '%' : '\u2014';
    }

    // Sync epoch display
    const mainEpoch = document.getElementById('epoch-display');
    const dashEpoch = document.getElementById('dash-epoch-display');
    if (mainEpoch && dashEpoch) dashEpoch.textContent = mainEpoch.textContent;
}

/** Setup dashboard button bindings */
function setupDashboardBindings() {
    // Header view toggle button
    const switchBtn = document.getElementById('btn-switch-view');
    if (switchBtn) {
        switchBtn.addEventListener('click', () => {
            switchView(_currentView === 'engineer' ? 'dashboard' : 'engineer');
        });
    }

    // Dashboard action buttons
    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    };

    bind('dash-btn-add-source', dashAddSource);
    bind('dash-btn-add-relay', dashAddRelay);
    bind('dash-btn-add-ground-customer', dashAddGroundCustomer);
    bind('dash-btn-add-orbital-customer', dashAddOrbitalCustomer);
    bind('dash-btn-auto-connect', () => { dashboardAutoConnect(); updateDashboardHUD(); });

    bind('dash-btn-play', () => {
        setPlaying(!isPlaying());
        const btn = document.getElementById('dash-btn-play');
        if (btn) btn.textContent = isPlaying() ? '⏸ Pause' : '▶ Play';
    });

    bind('dash-btn-reset', () => {
        resetTime();
        _totalRevenue = 0;
        _lastRevenueTick = 0;
        resetUptime();
        updateDashboardHUD();
    });

    bind('dash-btn-engineer', () => switchView('engineer'));

    document.querySelectorAll('.dash-speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setSpeed(parseInt(btn.dataset.dashSpeed));
            document.querySelectorAll('.dash-speed-btn').forEach(b =>
                b.classList.toggle('active', b === btn)
            );
        });
    });
}

setupDashboardBindings();

// Load demo scene
loadDemoScene();

animate();

console.log('Aquila Optical Power Network initialised.');
