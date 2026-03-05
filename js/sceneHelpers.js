/**
 * sceneHelpers.js — Lighting, starfield background, coordinate axes.
 */

import * as THREE from 'three';

/**
 * Add standard lighting to the scene.
 * @param {THREE.Scene} scene
 */
export function addLighting(scene) {
    // Ambient light — soft fill
    const ambient = new THREE.AmbientLight(0x334466, 0.6);
    scene.add(ambient);

    // Directional light — sun
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(50, 30, 50);
    scene.add(sun);

    // Subtle hemisphere light for softer shading
    const hemi = new THREE.HemisphereLight(0x6688cc, 0x222244, 0.3);
    scene.add(hemi);
}

/**
 * Create a starfield as a large sphere of random points.
 * @param {number} count  — number of stars
 * @param {number} radius — radius of the star sphere in scene units
 * @returns {THREE.Points}
 */
export function createStarfield(count = 6000, radius = 800) {
    const positions = new Float32Array(count * 3);
    const colours = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        // Random point on sphere surface
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = radius * (0.95 + Math.random() * 0.05);

        positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);

        // Slight colour variation (white to pale blue)
        const brightness = 0.5 + Math.random() * 0.5;
        colours[i * 3]     = brightness * (0.85 + Math.random() * 0.15);
        colours[i * 3 + 1] = brightness * (0.85 + Math.random() * 0.15);
        colours[i * 3 + 2] = brightness;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

    const material = new THREE.PointsMaterial({
        size: 0.3,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
    });

    return new THREE.Points(geometry, material);
}
