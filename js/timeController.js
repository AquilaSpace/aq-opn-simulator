/**
 * timeController.js — Time slider, play/pause, speed control, epoch display,
 * propagation tick for orbital nodes and Moon.
 */

import { MOON_DISTANCE, MOON_ORBITAL_PERIOD_S, SCENE_SCALE_KM } from './constants.js';
import { propagateOrbit, updateOrbitTrail } from './orbitalMechanics.js';
import { getAllNodes, getNode, setNodeScenePosition } from './nodeManager.js';
import { recomputeAllLinks } from './linkManager.js';
import { sampleUptime, resetUptime } from './uptimeTracker.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Base epoch (Date object) */
let _epoch = new Date('2025-03-05T12:00:00Z');

/** Elapsed simulation time in seconds from epoch */
let _simTime = 0;

/** Whether simulation is playing */
let _playing = false;

/** Speed multiplier */
let _speedMultiplier = 1;

/** Physics update throttle (10 Hz) */
let _lastPhysicsUpdate = 0;
const PHYSICS_INTERVAL_MS = 100;

/** Moon mesh reference */
let _moonMesh = null;

/** Callbacks */
const _listeners = {
    tick: [],
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialise the time controller.
 * @param {THREE.Mesh} moonMesh — reference to Moon mesh for position updates
 */
export function initTimeController(moonMesh) {
    _moonMesh = moonMesh;
    _setupUI();
    _updateEpochDisplay();
}

export function onTimeTick(fn) { _listeners.tick.push(fn); }

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSimTime() { return _simTime; }
export function isPlaying() { return _playing; }
export function getSpeedMultiplier() { return _speedMultiplier; }

export function setPlaying(playing) {
    _playing = playing;
    const btn = document.getElementById('time-play');
    if (btn) btn.textContent = _playing ? '⏸' : '▶';
}

export function setSpeed(multiplier) {
    _speedMultiplier = multiplier;
    document.querySelectorAll('#timebar .speed-buttons button').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.speed) === multiplier);
    });
}

export function resetTime() {
    _simTime = 0;
    resetUptime();
    _updateEpochDisplay();
    _updateSlider();
    _propagateAll();
}

// ---------------------------------------------------------------------------
// Tick (called from render loop)
// ---------------------------------------------------------------------------

/**
 * Update the time controller. Call each frame.
 * @param {number} dt — real-time delta in seconds
 */
export function updateTimeController(dt) {
    if (!_playing) return;

    _simTime += dt * _speedMultiplier;

    // Propagate orbital positions every frame for smooth movement
    _propagatePositions();

    // Throttle expensive operations (link recompute, UI, uptime) at 10 Hz
    const now = performance.now();
    if (now - _lastPhysicsUpdate >= PHYSICS_INTERVAL_MS) {
        _lastPhysicsUpdate = now;
        _updateEpochDisplay();
        _updateSlider();
        _recomputeAndSample();
        _listeners.tick.forEach(fn => fn(_simTime));
    }
}

// ---------------------------------------------------------------------------
// Propagation
// ---------------------------------------------------------------------------

/** Fast per-frame position update — just moves meshes, no link recompute */
function _propagatePositions() {
    const nodes = getAllNodes();

    for (const node of nodes) {
        if ((node.type === 'ORBITAL_RELAY' || node.type === 'ORBITAL_CUSTOMER') && node.params.orbitalElements) {
            const pos = propagateOrbit(node.params.orbitalElements, _simTime);
            setNodeScenePosition(node.id, pos.x, pos.y, pos.z);
        }
    }

    // Moon position (simplified circular orbit)
    if (_moonMesh) {
        const moonAngle = (2 * Math.PI * _simTime) / MOON_ORBITAL_PERIOD_S;
        _moonMesh.position.x = MOON_DISTANCE * Math.sin(moonAngle);
        _moonMesh.position.z = MOON_DISTANCE * Math.cos(moonAngle);
        _moonMesh.position.y = MOON_DISTANCE * 0.089 * Math.sin(moonAngle); // ~5.14° incl
    }
}

/** Throttled: recompute links, update orbit trails, sample uptime */
function _recomputeAndSample() {
    const nodes = getAllNodes();
    let hasOrbital = false;

    for (const node of nodes) {
        if ((node.type === 'ORBITAL_RELAY' || node.type === 'ORBITAL_CUSTOMER') && node.params.orbitalElements) {
            updateOrbitTrail(node.id, node.params.orbitalElements, _simTime, 0x4488ff);
            hasOrbital = true;
        }
    }

    if (hasOrbital) {
        recomputeAllLinks();
    }

    sampleUptime();
}

/** Full propagation — used for step/reset (not the per-frame path) */
function _propagateAll() {
    _propagatePositions();
    _recomputeAndSample();
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function _setupUI() {
    // Play/Pause
    const playBtn = document.getElementById('time-play');
    if (playBtn) {
        playBtn.addEventListener('click', () => setPlaying(!_playing));
    }

    // Reset
    const resetBtn = document.getElementById('time-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetTime);
    }

    // Step forward (advance by 60 seconds × speed multiplier)
    const stepBtn = document.getElementById('time-step');
    if (stepBtn) {
        stepBtn.addEventListener('click', () => {
            _simTime += 60 * _speedMultiplier;
            _updateEpochDisplay();
            _updateSlider();
            _propagateAll();
        });
    }

    // Speed buttons
    document.querySelectorAll('#timebar .speed-buttons button').forEach(btn => {
        btn.addEventListener('click', () => {
            setSpeed(parseInt(btn.dataset.speed));
        });
    });

    // Time slider
    const slider = document.getElementById('time-slider');
    if (slider) {
        slider.addEventListener('input', () => {
            _simTime = parseFloat(slider.value);
            _updateEpochDisplay();
            _propagateAll();
        });
    }
}

function _updateEpochDisplay() {
    const display = document.getElementById('epoch-display');
    if (!display) return;

    const currentDate = new Date(_epoch.getTime() + _simTime * 1000);
    const y = currentDate.getUTCFullYear();
    const m = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(currentDate.getUTCDate()).padStart(2, '0');
    const hh = String(currentDate.getUTCHours()).padStart(2, '0');
    const mm = String(currentDate.getUTCMinutes()).padStart(2, '0');
    const ss = String(currentDate.getUTCSeconds()).padStart(2, '0');
    display.textContent = `${y}-${m}-${d} ${hh}:${mm}:${ss} UTC`;
}

function _updateSlider() {
    const slider = document.getElementById('time-slider');
    if (!slider) return;

    // Dynamically adjust slider range to current sim time
    const maxVal = Math.max(86400, _simTime + 3600);
    slider.max = maxVal;
    slider.value = _simTime;
}
