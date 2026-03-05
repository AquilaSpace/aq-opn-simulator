/**
 * cameraPresets.js — Named camera positions with smooth animated transitions.
 */

import * as THREE from 'three';
import { CAMERA_PRESETS } from './constants.js';

let _camera = null;
let _controls = null;
let _animating = false;
let _animStart = 0;
const _animDuration = 1000; // ms

const _startPos = new THREE.Vector3();
const _endPos = new THREE.Vector3();
const _startTarget = new THREE.Vector3();
const _endTarget = new THREE.Vector3();

/**
 * Initialise with camera and controls references.
 */
export function initCameraPresets(camera, controls) {
    _camera = camera;
    _controls = controls;
}

/**
 * Transition to a named preset.
 * @param {string} presetKey — key from CAMERA_PRESETS
 */
export function goToPreset(presetKey) {
    const preset = CAMERA_PRESETS[presetKey];
    if (!preset || !_camera || !_controls) return;

    _startPos.copy(_camera.position);
    _endPos.set(...preset.position);
    _startTarget.copy(_controls.target);
    _endTarget.set(...preset.target);

    _animStart = performance.now();
    _animating = true;
}

/**
 * Focus camera on a specific world position.
 * @param {THREE.Vector3} position — world position to focus on
 * @param {number} distance — distance from target
 */
export function focusOn(position, distance = 15) {
    if (!_camera || !_controls) return;

    _startPos.copy(_camera.position);
    const dir = new THREE.Vector3().subVectors(_camera.position, _controls.target).normalize();
    _endPos.copy(position).add(dir.multiplyScalar(distance));
    _startTarget.copy(_controls.target);
    _endTarget.copy(position);

    _animStart = performance.now();
    _animating = true;
}

/**
 * Smooth ease-in-out function.
 */
function easeInOut(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Call each frame to update camera animation.
 * @returns {boolean} true if animation is active
 */
export function updateCameraAnimation() {
    if (!_animating) return false;

    const elapsed = performance.now() - _animStart;
    let t = Math.min(elapsed / _animDuration, 1);
    t = easeInOut(t);

    _camera.position.lerpVectors(_startPos, _endPos, t);
    _controls.target.lerpVectors(_startTarget, _endTarget, t);
    _controls.update();

    if (t >= 1) {
        _animating = false;
    }

    return true;
}

/**
 * Whether an animation is currently playing.
 */
export function isAnimating() {
    return _animating;
}
