/**
 * main.js — Scene setup, renderer, camera, orbit controls, render loop, orchestration.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EARTH_RADIUS, CAMERA_PRESETS } from './constants.js';
import { createEarth, createMoon, createGridOverlay } from './earth.js';
import { addLighting, createStarfield } from './sceneHelpers.js';
import { initCameraPresets, goToPreset, updateCameraAnimation } from './cameraPresets.js';

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
// Export state for other modules
// ---------------------------------------------------------------------------

export { scene, camera, renderer, controls, canvas, earthMesh, moonMesh, gridOverlay };

/**
 * Get the Earth mesh for raycasting.
 */
export function getEarthMesh() { return earthMesh; }

/**
 * Get the Moon mesh for raycasting.
 */
export function getMoonMesh() { return moonMesh; }

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

function animate() {
    requestAnimationFrame(animate);

    // Earth rotation
    if (autoRotate) {
        earthMesh.rotation.y += earthRotateSpeed;
        earthAtmosphere.rotation.y = earthMesh.rotation.y;
        gridOverlay.rotation.y = earthMesh.rotation.y;
    }

    // Camera animation
    updateCameraAnimation();

    controls.update();
    renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

setupUIBindings();
animate();

console.log('Aquila OPN Simulator initialised.');
