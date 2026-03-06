/**
 * dashboard.js — Simplified, defence/aerospace-focused dashboard view.
 * Reuses core simulation modules with a minimal HUD overlay.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    EARTH_RADIUS, NODE_TYPES, EARTH_RADIUS_KM, SCENE_SCALE_KM,
    latLonAltToScene, sceneToLatLonAlt,
} from './constants.js';
import { createEarth, createMoon, createGridOverlay } from './earth.js';
import { addLighting, createStarfield } from './sceneHelpers.js';
import {
    initNodeManager, createNode, getAllNodes, getNodeCount, getNodeGroup,
    onNodeChange, updateLabels,
} from './nodeManager.js';
import {
    initLinkManager, createLink, getAllLinks, getLinkCount,
    recomputeAllLinks, onLinkChange, updateLinkAnimations,
    setBeamType, setAtmCondition,
} from './linkManager.js';
import { initTimeController, updateTimeController, isPlaying, setPlaying, setSpeed, resetTime, getSimTime, onTimeTick } from './timeController.js';
import { initOrbitTrails } from './orbitalMechanics.js';
import { initTerrestrial, updateTerrestrial } from './terrestrial.js';
import { initCameraPresets, updateCameraAnimation } from './cameraPresets.js';
import { getUptime, resetUptime } from './uptimeTracker.js';

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

const canvas = document.getElementById('viewport');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.001, 2000);
camera.position.set(0, 12, 30);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x050510, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = EARTH_RADIUS * 1.05;
controls.maxDistance = 600;
controls.target.set(0, 0, 0);
controls.update();

// Populate scene
addLighting(scene);
scene.add(createStarfield());

const { mesh: earthMesh, atmosphere } = createEarth();
scene.add(earthMesh);
scene.add(atmosphere);

const grid = createGridOverlay();
scene.add(grid);

const moonMesh = createMoon();
scene.add(moonMesh);

// Earth-Moon corridor line
const corridorMat = new THREE.LineDashedMaterial({
    color: 0x334466, transparent: true, opacity: 0.3,
    dashSize: 2, gapSize: 1, depthWrite: false,
});
const corridorGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), moonMesh.position.clone(),
]);
const corridorLine = new THREE.Line(corridorGeo, corridorMat);
corridorLine.computeLineDistances();
scene.add(corridorLine);

// Init managers
initNodeManager(scene, camera);
initLinkManager(scene);
initTimeController(moonMesh);
initOrbitTrails(scene);
initCameraPresets(camera, controls);
initTerrestrial(scene, camera, earthMesh);

// Export for terrestrial module
export { scene, camera, renderer, controls, canvas, earthMesh, moonMesh, grid as gridOverlay };
export function getEarthMesh() { return earthMesh; }

// ---------------------------------------------------------------------------
// Revenue model
// ---------------------------------------------------------------------------

const REVENUE_PER_15MIN = 250; // $250 per 15 min of customer access
let _totalRevenue = 0;
let _lastRevenueTick = 0;
const REVENUE_INTERVAL_S = 900; // 15 minutes in sim seconds

// ---------------------------------------------------------------------------
// Random placement helpers
// ---------------------------------------------------------------------------

/** Random latitude/longitude on Earth surface, biased toward populated regions */
function _randomLatLon() {
    // Slight bias toward mid-latitudes (defence-relevant regions)
    const lat = (Math.random() - 0.5) * 120; // -60 to 60
    const lon = (Math.random() - 0.5) * 360; // -180 to 180
    return { lat_deg: lat, lon_deg: lon };
}

/** Random GEO longitude */
function _randomGeoLon() {
    return (Math.random() - 0.5) * 360;
}

/** Find the best source to connect a customer to (via relay if needed) */
function _findBestSource(customerPos) {
    const sources = getAllNodes().filter(n => n.type === 'GROUND_SOURCE');
    if (sources.length === 0) return null;

    let best = null;
    let bestDist = Infinity;
    for (const s of sources) {
        const dx = s.scenePos.x - customerPos.x;
        const dy = s.scenePos.y - customerPos.y;
        const dz = s.scenePos.z - customerPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < bestDist) {
            bestDist = dist;
            best = s;
        }
    }
    return best;
}

/** Find the relay with best LOS to a given position */
function _findBestRelay(targetPos) {
    const relays = getAllNodes().filter(n => n.type === 'ORBITAL_RELAY');
    if (relays.length === 0) return null;

    let best = null;
    let bestDist = Infinity;
    for (const r of relays) {
        const dx = r.scenePos.x - targetPos.x;
        const dy = r.scenePos.y - targetPos.y;
        const dz = r.scenePos.z - targetPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < bestDist) {
            bestDist = dist;
            best = r;
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// Add node actions
// ---------------------------------------------------------------------------

function addSource() {
    const { lat_deg, lon_deg } = _randomLatLon();
    createNode({
        type: 'GROUND_SOURCE',
        name: 'Power Station ' + (getAllNodes().filter(n => n.type === 'GROUND_SOURCE').length + 1),
        position: { lat_deg, lon_deg, alt_km: 0 },
    });
    _autoConnect();
    updateHUD();
}

function addRelay() {
    const lon = _randomGeoLon();
    const trueAnomaly = ((lon % 360) + 360) % 360;
    createNode({
        type: 'ORBITAL_RELAY',
        name: 'Relay SAT-' + (getAllNodes().filter(n => n.type === 'ORBITAL_RELAY').length + 1),
        position: { lat_deg: 0, lon_deg: lon, alt_km: 35786 },
        params: {
            orbitalElements: {
                semiMajorAxis_km: 42164,
                eccentricity: 0,
                inclination_deg: 0,
                raan_deg: 0,
                argOfPerigee_deg: 0,
                trueAnomaly_deg: trueAnomaly,
            },
        },
    });
    _autoConnect();
    updateHUD();
}

function addGroundCustomer() {
    const { lat_deg, lon_deg } = _randomLatLon();
    createNode({
        type: 'GROUND_CUSTOMER',
        name: 'Ground Customer ' + (getAllNodes().filter(n => n.type === 'GROUND_CUSTOMER' || n.type === 'ORBITAL_CUSTOMER').length + 1),
        position: { lat_deg, lon_deg, alt_km: 0 },
    });
    _autoConnect();
    updateHUD();
}

function addOrbitalCustomer() {
    const lon = _randomGeoLon();
    createNode({
        type: 'ORBITAL_CUSTOMER',
        name: 'Satellite Customer ' + (getAllNodes().filter(n => n.type === 'GROUND_CUSTOMER' || n.type === 'ORBITAL_CUSTOMER').length + 1),
        position: { lat_deg: 0, lon_deg: lon, alt_km: 400 },
        params: {
            orbitalElements: {
                semiMajorAxis_km: 6771,
                eccentricity: 0,
                inclination_deg: 51.6,
                raan_deg: Math.random() * 360,
                argOfPerigee_deg: 0,
                trueAnomaly_deg: ((lon % 360) + 360) % 360,
            },
        },
    });
    _autoConnect();
    updateHUD();
}

/** Auto-connect: for each unconnected customer, find a source→relay→customer path */
function _autoConnect() {
    const nodes = getAllNodes();
    const links = getAllLinks();
    const existingPairs = new Set(links.map(l => l.fromId + '→' + l.toId));

    const sources = nodes.filter(n => n.type === 'GROUND_SOURCE');
    const customers = nodes.filter(n =>
        n.type === 'GROUND_CUSTOMER' || n.type === 'ORBITAL_CUSTOMER' || n.type === 'LUNAR_NODE'
    );

    // Connect every source to nearest relay
    for (const source of sources) {
        const relay = _findBestRelay(source.scenePos);
        if (relay && !existingPairs.has(source.id + '→' + relay.id)) {
            createLink(source.id, relay.id);
            existingPairs.add(source.id + '→' + relay.id);
        }
    }

    // Connect every customer to nearest relay
    for (const customer of customers) {
        const hasIncoming = getAllLinks().some(l => l.toId === customer.id);
        if (hasIncoming) continue;

        const relay = _findBestRelay(customer.scenePos);
        if (relay) {
            const relayHasIncoming = getAllLinks().some(l => l.toId === relay.id);
            if (!relayHasIncoming) {
                const source = _findBestSource(relay.scenePos);
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
            const source = _findBestSource(customer.scenePos);
            if (source && !existingPairs.has(source.id + '→' + customer.id)) {
                createLink(source.id, customer.id);
                existingPairs.add(source.id + '→' + customer.id);
            }
        }
    }

    recomputeAllLinks();
}

// ---------------------------------------------------------------------------
// HUD updates
// ---------------------------------------------------------------------------

function updateHUD() {
    const nodes = getAllNodes();
    const links = getAllLinks();

    const sources = nodes.filter(n => n.type === 'GROUND_SOURCE').length;
    const relays = nodes.filter(n => n.type === 'ORBITAL_RELAY').length;
    const orbCustomers = nodes.filter(n => n.type === 'ORBITAL_CUSTOMER').length;
    const gndCustomers = nodes.filter(n => n.type === 'GROUND_CUSTOMER' || n.type === 'LUNAR_NODE').length;
    const activeLinks = links.filter(l => l.status === 'ACTIVE' || l.status === 'MARGINAL').length;

    document.getElementById('stat-sources').textContent = sources;
    document.getElementById('stat-relays').textContent = relays;
    const orbEl = document.getElementById('stat-orbital-customers');
    const gndEl = document.getElementById('stat-ground-customers');
    if (orbEl) orbEl.textContent = orbCustomers;
    if (gndEl) gndEl.textContent = gndCustomers;
    document.getElementById('stat-links-active').textContent = activeLinks;

    // Total delivered power
    let totalPower_W = 0;
    for (const link of links) {
        if (link.budget && (link.status === 'ACTIVE' || link.status === 'MARGINAL')) {
            totalPower_W += link.budget.rxPower_W || 0;
        }
    }
    const powerStr = totalPower_W >= 1000
        ? (totalPower_W / 1000).toFixed(2) + ' kW'
        : totalPower_W.toFixed(1) + ' W';
    document.getElementById('stat-power').textContent = powerStr;

    // Revenue
    document.getElementById('stat-revenue').textContent = '$' + _formatRevenue(_totalRevenue);

    // Network uptime (average across all customers)
    const customerNodes = nodes.filter(n =>
        n.type === 'GROUND_CUSTOMER' || n.type === 'ORBITAL_CUSTOMER' || n.type === 'LUNAR_NODE'
    );
    let avgUptime = null;
    if (customerNodes.length > 0) {
        let sum = 0;
        let count = 0;
        for (const c of customerNodes) {
            const u = getUptime(c.id);
            if (u !== null) { sum += u; count++; }
        }
        if (count > 0) avgUptime = sum / count;
    }
    document.getElementById('stat-uptime').textContent =
        avgUptime !== null ? avgUptime.toFixed(1) + '%' : '\u2014';
}

function _formatRevenue(amount) {
    if (amount >= 1e6) return (amount / 1e6).toFixed(2) + 'M';
    if (amount >= 1e3) return (amount / 1e3).toFixed(1) + 'K';
    return amount.toFixed(0);
}

/** Update revenue based on simulation time — $250 per 15 min per active customer connection */
function updateRevenue(simTime) {
    const links = getAllLinks();
    // Count customers with at least one active incoming link
    const poweredCustomers = new Set();
    for (const link of links) {
        if (link.status === 'ACTIVE' || link.status === 'MARGINAL') {
            const toNode = getAllNodes().find(n => n.id === link.toId);
            if (toNode && (toNode.type === 'GROUND_CUSTOMER' || toNode.type === 'ORBITAL_CUSTOMER' || toNode.type === 'LUNAR_NODE')) {
                poweredCustomers.add(link.toId);
            }
        }
    }

    // Accumulate revenue at 15-minute intervals
    const elapsed = simTime - _lastRevenueTick;
    if (elapsed >= REVENUE_INTERVAL_S) {
        const intervals = Math.floor(elapsed / REVENUE_INTERVAL_S);
        _totalRevenue += poweredCustomers.size * REVENUE_PER_15MIN * intervals;
        _lastRevenueTick += intervals * REVENUE_INTERVAL_S;
    }
}

// ---------------------------------------------------------------------------
// UI bindings
// ---------------------------------------------------------------------------

document.getElementById('btn-add-source').addEventListener('click', addSource);
document.getElementById('btn-add-relay').addEventListener('click', addRelay);
document.getElementById('btn-add-customer')?.addEventListener('click', addGroundCustomer);
document.getElementById('btn-add-ground-customer')?.addEventListener('click', addGroundCustomer);
document.getElementById('btn-add-orbital-customer')?.addEventListener('click', addOrbitalCustomer);
document.getElementById('btn-auto-connect').addEventListener('click', () => {
    _autoConnect();
    updateHUD();
});

document.getElementById('btn-play').addEventListener('click', () => {
    setPlaying(!isPlaying());
    document.getElementById('btn-play').textContent = isPlaying() ? '⏸ Pause' : '▶ Play';
});

document.getElementById('btn-reset').addEventListener('click', () => {
    resetTime();
    _totalRevenue = 0;
    _lastRevenueTick = 0;
    resetUptime();
    updateHUD();
});

document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setSpeed(parseInt(btn.dataset.speed));
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
});

onLinkChange(updateHUD);
onNodeChange(updateHUD);

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);

    controls.update();
    updateCameraAnimation(dt);
    updateTimeController(dt);
    updateLinkAnimations(dt);
    updateLabels(camera);
    updateTerrestrial(camera, renderer);

    // Update corridor line to Moon
    corridorGeo.setFromPoints([new THREE.Vector3(0, 0, 0), moonMesh.position.clone()]);
    corridorLine.computeLineDistances();

    // Revenue ticking
    if (isPlaying()) {
        updateRevenue(getSimTime());
        updateHUD();
    }

    renderer.render(scene, camera);
}

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initial resize
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
renderer.setSize(window.innerWidth, window.innerHeight);

// ---------------------------------------------------------------------------
// Load a starter scene
// ---------------------------------------------------------------------------

function loadStarterScene() {
    // Start with one source and one relay to demonstrate
    createNode({
        type: 'GROUND_SOURCE',
        name: 'Power Station 1',
        position: { lat_deg: -33.86, lon_deg: 151.21, alt_km: 0 },
    });

    createNode({
        type: 'ORBITAL_RELAY',
        name: 'Relay SAT-1',
        position: { lat_deg: 0, lon_deg: 130, alt_km: 35786 },
        params: {
            orbitalElements: {
                semiMajorAxis_km: 42164,
                eccentricity: 0,
                inclination_deg: 0,
                raan_deg: 0,
                argOfPerigee_deg: 0,
                trueAnomaly_deg: 130,
            },
        },
    });

    createNode({
        type: 'GROUND_CUSTOMER',
        name: 'Customer 1',
        position: { lat_deg: -22.3, lon_deg: 118.8, alt_km: 0 },
    });

    _autoConnect();
    updateHUD();
}

loadStarterScene();
animate();

console.log('Aquila OPN Dashboard initialised.');
