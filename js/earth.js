/**
 * earth.js — Earth + Moon globe rendering with textures, atmosphere glow, and grid overlay.
 */

import * as THREE from 'three';
import { EARTH_RADIUS, MOON_RADIUS, MOON_DISTANCE } from './constants.js';

/**
 * Create the Earth sphere with texture.
 * Falls back to a procedural blue sphere if texture fails to load.
 * @returns {{ mesh: THREE.Mesh, atmosphere: THREE.Mesh }}
 */
export function createEarth() {
    const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);

    // Try loading texture
    const textureLoader = new THREE.TextureLoader();
    const material = new THREE.MeshPhongMaterial({
        color: 0x2255aa,
        specular: 0x222222,
        shininess: 15,
    });

    textureLoader.load(
        'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
        (texture) => {
            material.map = texture;
            material.color.set(0xffffff);
            material.needsUpdate = true;
        },
        undefined,
        () => {
            // Fallback: keep the procedural blue
            console.warn('Earth texture failed to load — using procedural fallback.');
        }
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'earth';
    // Rotate -90° around Y so the texture centre (0° lon / Greenwich) aligns with +Z
    mesh.rotation.y = -Math.PI / 2;

    // Atmosphere glow — slightly larger transparent sphere with additive blending
    const atmosGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.015, 64, 64);
    const atmosMaterial = new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(atmosGeometry, atmosMaterial);
    atmosphere.name = 'atmosphere';

    return { mesh, atmosphere };
}

/**
 * Create lat/lon grid lines on the Earth surface.
 * @returns {THREE.Group}
 */
export function createGridOverlay() {
    const group = new THREE.Group();
    group.name = 'gridOverlay';

    const material = new THREE.LineBasicMaterial({
        color: 0x4488aa,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
    });

    const R = EARTH_RADIUS * 1.002; // Slightly above surface to avoid z-fighting
    const segments = 90;

    // Latitude lines every 30°
    for (let lat = -60; lat <= 60; lat += 30) {
        const latRad = lat * Math.PI / 180;
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const lon = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                R * Math.cos(latRad) * Math.sin(lon),
                R * Math.sin(latRad),
                R * Math.cos(latRad) * Math.cos(lon)
            ));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        group.add(new THREE.Line(geo, material));
    }

    // Longitude lines every 30°
    for (let lon = 0; lon < 360; lon += 30) {
        const lonRad = lon * Math.PI / 180;
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const lat = (i / segments) * Math.PI - Math.PI / 2;
            points.push(new THREE.Vector3(
                R * Math.cos(lat) * Math.sin(lonRad),
                R * Math.sin(lat),
                R * Math.cos(lat) * Math.cos(lonRad)
            ));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        group.add(new THREE.Line(geo, material));
    }

    return group;
}

/**
 * Create the Moon sphere with texture.
 * @returns {THREE.Mesh}
 */
export function createMoon() {
    const geometry = new THREE.SphereGeometry(MOON_RADIUS, 32, 32);

    const textureLoader = new THREE.TextureLoader();
    const material = new THREE.MeshPhongMaterial({
        color: 0xaaaaaa,
        specular: 0x111111,
        shininess: 5,
    });

    textureLoader.load(
        'https://unpkg.com/three-globe/example/img/lunar-surface.jpg',
        (texture) => {
            material.map = texture;
            material.color.set(0xffffff);
            material.needsUpdate = true;
        },
        undefined,
        () => {
            console.warn('Moon texture failed to load — using grey fallback.');
        }
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'moon';

    // Initial position: along +Z axis at correct distance
    mesh.position.set(0, 0, MOON_DISTANCE);

    return mesh;
}
