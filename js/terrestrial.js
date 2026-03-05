/**
 * terrestrial.js — Terrestrial-level detail. Shows map tiles on a ground plane
 * when the camera is zoomed close to the Earth surface.
 *
 * Uses OpenStreetMap tile server for map imagery. Tiles are loaded dynamically
 * based on camera position and projected onto a local tangent plane.
 */

import * as THREE from 'three';
import {
    EARTH_RADIUS, EARTH_RADIUS_KM, SCENE_SCALE_KM,
    sceneToLatLonAlt, latLonAltToScene,
} from './constants.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Distance from Earth surface (scene units) below which terrestrial detail appears */
const ACTIVATION_DISTANCE = EARTH_RADIUS * 0.15; // ~960 km altitude

/** Tile server URL template */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Tile zoom level based on camera distance */
const ZOOM_LEVELS = [
    { maxDist: 0.005, zoom: 15 },   // ~5 km    → street level
    { maxDist: 0.01,  zoom: 13 },   // ~10 km   → city detail
    { maxDist: 0.03,  zoom: 11 },   // ~30 km   → city overview
    { maxDist: 0.1,   zoom: 9 },    // ~100 km  → regional
    { maxDist: 0.3,   zoom: 7 },    // ~300 km  → country detail
    { maxDist: 0.6,   zoom: 5 },    // ~600 km  → country
    { maxDist: 1.5,   zoom: 3 },    // ~1500 km → continental
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _scene = null;
let _camera = null;
let _controls = null;
let _groundGroup = null;
let _active = false;
let _currentZoom = -1;
let _currentCentreTile = { x: -1, y: -1 };
let _tileCache = new Map(); // 'z/x/y' → THREE.Texture
let _tileMeshes = []; // current tile meshes

const _textureLoader = new THREE.TextureLoader();
_textureLoader.crossOrigin = 'anonymous';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialise the terrestrial detail system.
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {object} controls — OrbitControls
 */
export function initTerrestrial(scene, camera, controls) {
    _scene = scene;
    _camera = camera;
    _controls = controls;

    _groundGroup = new THREE.Group();
    _groundGroup.name = 'terrestrial';
    _groundGroup.visible = false;
    _scene.add(_groundGroup);
}

// ---------------------------------------------------------------------------
// Update (call each frame)
// ---------------------------------------------------------------------------

/**
 * Update terrestrial detail based on camera position.
 */
export function updateTerrestrial() {
    if (!_camera || !_controls) return;

    // Distance from camera to Earth surface
    const camDist = _camera.position.length() - EARTH_RADIUS;

    if (camDist > ACTIVATION_DISTANCE) {
        if (_active) {
            _groundGroup.visible = false;
            _active = false;
        }
        return;
    }

    _active = true;
    _groundGroup.visible = true;

    // Determine zoom level
    let zoom = 2;
    for (const level of ZOOM_LEVELS) {
        if (camDist <= level.maxDist) {
            zoom = level.zoom;
            break;
        }
    }

    // Find the lat/lon the camera is looking at (controls target projected onto Earth)
    const target = _controls.target.clone();
    const targetOnSurface = target.normalize().multiplyScalar(EARTH_RADIUS);
    const { lat_deg, lon_deg } = sceneToLatLonAlt(
        targetOnSurface.x, targetOnSurface.y, targetOnSurface.z
    );

    // Convert to tile coordinates
    const centreTile = latLonToTile(lat_deg, lon_deg, zoom);

    // Only rebuild tiles if zoom or centre tile changed
    if (zoom === _currentZoom &&
        centreTile.x === _currentCentreTile.x &&
        centreTile.y === _currentCentreTile.y) {
        return;
    }

    _currentZoom = zoom;
    _currentCentreTile = centreTile;

    // Clear existing tiles
    _clearTiles();

    // Load a grid of tiles around the centre
    const gridRadius = 2; // 5×5 grid
    for (let dx = -gridRadius; dx <= gridRadius; dx++) {
        for (let dy = -gridRadius; dy <= gridRadius; dy++) {
            const tx = centreTile.x + dx;
            const ty = centreTile.y + dy;
            const maxTile = Math.pow(2, zoom);
            if (ty < 0 || ty >= maxTile) continue;
            const wrappedTx = ((tx % maxTile) + maxTile) % maxTile;
            _loadTile(wrappedTx, ty, zoom, lat_deg, lon_deg);
        }
    }
}

// ---------------------------------------------------------------------------
// Tile loading and rendering
// ---------------------------------------------------------------------------

function _loadTile(tx, ty, zoom, centreLat, centreLon) {
    const key = `${zoom}/${tx}/${ty}`;
    const url = TILE_URL.replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty);

    // Tile bounds in lat/lon
    const nw = tileToLatLon(tx, ty, zoom);
    const se = tileToLatLon(tx + 1, ty + 1, zoom);

    const tileCentreLat = (nw.lat + se.lat) / 2;
    const tileCentreLon = (nw.lon + se.lon) / 2;

    // Scene position for tile centre (on Earth surface, slightly above to avoid z-fighting)
    const pos = latLonAltToScene(tileCentreLat, tileCentreLon, 0.5);
    const scenePos = new THREE.Vector3(pos.x, pos.y, pos.z);

    // Tile size in scene units (approximate)
    const latSpan = Math.abs(nw.lat - se.lat);
    const lonSpan = Math.abs(nw.lon - se.lon);
    const kmPerDegLat = 111.32;
    const kmPerDegLon = 111.32 * Math.cos(tileCentreLat * Math.PI / 180);
    const tileWidthKm = lonSpan * kmPerDegLon;
    const tileHeightKm = latSpan * kmPerDegLat;
    const tileWidthScene = tileWidthKm / SCENE_SCALE_KM;
    const tileHeightScene = tileHeightKm / SCENE_SCALE_KM;

    // Create plane geometry
    const planeGeo = new THREE.PlaneGeometry(tileWidthScene, tileHeightScene);

    // Load texture
    let material;
    if (_tileCache.has(key)) {
        material = new THREE.MeshBasicMaterial({
            map: _tileCache.get(key),
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
    } else {
        // Placeholder material while loading
        material = new THREE.MeshBasicMaterial({
            color: 0x1a1a2e,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        _textureLoader.load(url, (texture) => {
            _tileCache.set(key, texture);
            material.map = texture;
            material.color.set(0xffffff);
            material.opacity = 0.85;
            material.needsUpdate = true;
        }, undefined, () => {
            // Failed to load — keep placeholder
        });
    }

    const mesh = new THREE.Mesh(planeGeo, material);
    mesh.position.copy(scenePos);

    // Orient the plane to be tangent to the Earth surface at this point
    // Normal = direction from Earth centre to tile position
    const normal = scenePos.clone().normalize();
    mesh.lookAt(scenePos.clone().add(normal));

    _groundGroup.add(mesh);
    _tileMeshes.push(mesh);
}

function _clearTiles() {
    for (const mesh of _tileMeshes) {
        _groundGroup.remove(mesh);
        mesh.geometry.dispose();
        // Don't dispose material.map — it's cached
        mesh.material.dispose();
    }
    _tileMeshes = [];
}

// ---------------------------------------------------------------------------
// Tile math (Web Mercator)
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to tile coordinates at a given zoom level.
 */
function latLonToTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

/**
 * Convert tile coordinates to lat/lon (northwest corner).
 */
function tileToLatLon(x, y, zoom) {
    const n = Math.pow(2, zoom);
    const lon = x / n * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
    const lat = latRad * 180 / Math.PI;
    return { lat, lon };
}

/**
 * Whether the terrestrial view is currently active.
 */
export function isTerrestrialActive() {
    return _active;
}
