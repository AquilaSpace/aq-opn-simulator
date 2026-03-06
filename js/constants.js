/**
 * constants.js — Physical constants, scale factors, node type definitions, colour palette.
 *
 * Coordinate system:
 *   Three.js Y-up. 1 scene unit = 1000 km.
 *   Earth radius = 6.371 units. North pole = +Y. Greenwich meridian = +Z.
 *   Lat/lon → Cartesian:
 *     x = R * cos(lat) * sin(lon)
 *     y = R * sin(lat)
 *     z = R * cos(lat) * cos(lon)
 *   where lat and lon are in radians.
 */

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

/** 1 scene unit = this many km */
export const SCENE_SCALE_KM = 1000;

/** Earth mean radius in km */
export const EARTH_RADIUS_KM = 6371;

/** Earth radius in scene units */
export const EARTH_RADIUS = EARTH_RADIUS_KM / SCENE_SCALE_KM; // 6.371

/** Moon mean radius in km */
export const MOON_RADIUS_KM = 1737.4;

/** Moon radius in scene units */
export const MOON_RADIUS = MOON_RADIUS_KM / SCENE_SCALE_KM;

/** Mean Earth–Moon distance in km */
export const MOON_DISTANCE_KM = 384400;

/** Mean Earth–Moon distance in scene units */
export const MOON_DISTANCE = MOON_DISTANCE_KM / SCENE_SCALE_KM;

/** Moon orbital period in seconds */
export const MOON_ORBITAL_PERIOD_S = 27.3 * 24 * 3600;

// ---------------------------------------------------------------------------
// Physical constants
// ---------------------------------------------------------------------------

/** Speed of light in m/s */
export const SPEED_OF_LIGHT = 299792458;

/** Gravitational parameter of Earth, km³/s² */
export const MU_EARTH = 398600.4418;

/** Atmospheric scale height in km */
export const ATMOSPHERE_SCALE_HEIGHT_KM = 8.5;

/** Karman line — edge of space in km */
export const KARMAN_LINE_KM = 100;

/** Minimum elevation angle for ground links (radians) */
export const MIN_ELEVATION_RAD = 10 * Math.PI / 180;

// ---------------------------------------------------------------------------
// Beam types
// ---------------------------------------------------------------------------

export const BEAM_TYPES = {
    YB_FIBRE: {
        label: 'Yb Fibre (Aquila default)',
        wavelength_nm: 1080,
        wavelength_m: 1080e-9,
        extinctionClear_dBpkm: 0.20,
        extinctionHaze_dBpkm: 3.0,
        extinctionRain_dBpkm: 10.0,
        visColour: 0xff6622,
        visColourHex: '#ff6622',
    },
    EYE_SAFE: {
        label: 'Eye-Safe Telecom (1550 nm)',
        wavelength_nm: 1550,
        wavelength_m: 1550e-9,
        extinctionClear_dBpkm: 0.15,
        extinctionHaze_dBpkm: 2.5,
        extinctionRain_dBpkm: 8.0,
        visColour: 0xcc44ff,
        visColourHex: '#cc44ff',
    },
    GREEN_532: {
        label: 'Freq-Doubled Green (532 nm)',
        wavelength_nm: 532,
        wavelength_m: 532e-9,
        extinctionClear_dBpkm: 0.35,
        extinctionHaze_dBpkm: 5.0,
        extinctionRain_dBpkm: 15.0,
        visColour: 0x00ff44,
        visColourHex: '#00ff44',
    },
};

export const ATMOSPHERIC_CONDITIONS = {
    clear: { label: 'Clear', key: 'extinctionClear_dBpkm' },
    haze:  { label: 'Haze',  key: 'extinctionHaze_dBpkm' },
    rain:  { label: 'Light Rain', key: 'extinctionRain_dBpkm' },
};

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

export const NODE_TYPES = {
    GROUND_SOURCE: {
        label: 'Ground Source',
        colour: 0xffaa00,
        colourHex: '#ffaa00',
        shape: 'cone_sphere',
        description: 'Terrestrial power generation facility',
        defaults: {
            transmitPower_kW: 1000,
            apertureDiameter_m: 5.0,
            trackingAccuracy_mrad: 0.0001,
            transmitterEfficiency: 0.90,
            totalAvailablePower_kW: 2000,
            outputBeams: 4,
        },
    },
    GROUND_RELAY: {
        label: 'Ground Relay',
        colour: 0x00cccc,
        colourHex: '#00cccc',
        shape: 'octahedron',
        description: 'Ground-based relay / repeater tower',
        defaults: {
            transmitPower_kW: 500,
            apertureDiameter_m: 4.0,
            trackingAccuracy_mrad: 0.0001,
            transmitterEfficiency: 0.88,
            receiveAperture_m: 5.0,
            retransmitEfficiency: 0.80,
            maxSimultaneousLinks: 4,
        },
    },
    GROUND_CUSTOMER: {
        label: 'Ground Customer',
        colour: 0x00ff66,
        colourHex: '#00ff66',
        shape: 'cube',
        description: 'Power consumer endpoint',
        defaults: {
            requiredPower_kW: 10,
            apertureDiameter_m: 5.0,
            trackingAccuracy_mrad: 0.0001,
            transmitterEfficiency: 0.0,
            transmitPower_kW: 0,
        },
    },
    ORBITAL_RELAY: {
        label: 'Orbital Relay',
        colour: 0x4488ff,
        colourHex: '#4488ff',
        shape: 'sphere_ring',
        description: 'Satellite relay in Earth orbit',
        defaults: {
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
                trueAnomaly_deg: 0,
            },
        },
    },
    ORBITAL_CUSTOMER: {
        label: 'Orbital Customer',
        colour: 0x66ffaa,
        colourHex: '#66ffaa',
        shape: 'cube',
        description: 'Satellite or station receiving power in orbit',
        defaults: {
            requiredPower_kW: 5,
            apertureDiameter_m: 3.0,
            trackingAccuracy_mrad: 0.0001,
            transmitterEfficiency: 0.0,
            transmitPower_kW: 0,
            orbitalElements: {
                semiMajorAxis_km: 6771,
                eccentricity: 0,
                inclination_deg: 51.6,
                raan_deg: 0,
                argOfPerigee_deg: 0,
                trueAnomaly_deg: 0,
            },
        },
    },
    LUNAR_NODE: {
        label: 'Lunar Node',
        colour: 0xccccdd,
        colourHex: '#ccccdd',
        shape: 'cylinder',
        description: 'Lunar surface installation',
        defaults: {
            transmitPower_kW: 50,
            apertureDiameter_m: 3.0,
            trackingAccuracy_mrad: 0.0001,
            transmitterEfficiency: 0.85,
            requiredPower_kW: 5,
        },
    },
    MOBILE_NODE: {
        label: 'Mobile Node',
        colour: 0xff8800,
        colourHex: '#ff8800',
        shape: 'arrow_cone',
        description: 'Drone, aircraft, or mobile platform',
        defaults: {
            transmitPower_kW: 5,
            apertureDiameter_m: 0.5,
            trackingAccuracy_mrad: 0.001,
            transmitterEfficiency: 0.80,
            speed_ms: 50,
            heading_deg: 0,
            altitude_m: 1000,
        },
    },
};

// ---------------------------------------------------------------------------
// Orbital presets
// ---------------------------------------------------------------------------

export const ORBITAL_PRESETS = {
    LEO_400: { label: 'LEO 400 km (ISS-like)', semiMajorAxis_km: 6771, eccentricity: 0, inclination_deg: 51.6, raan_deg: 0, argOfPerigee_deg: 0, trueAnomaly_deg: 0 },
    LEO_800: { label: 'LEO 800 km (Sun-sync)', semiMajorAxis_km: 7171, eccentricity: 0, inclination_deg: 98.7, raan_deg: 0, argOfPerigee_deg: 0, trueAnomaly_deg: 0 },
    MEO:     { label: 'MEO (GPS-like)',         semiMajorAxis_km: 26560, eccentricity: 0, inclination_deg: 55, raan_deg: 0, argOfPerigee_deg: 0, trueAnomaly_deg: 0 },
    GEO:     { label: 'GEO',                   semiMajorAxis_km: 42164, eccentricity: 0, inclination_deg: 0, raan_deg: 0, argOfPerigee_deg: 0, trueAnomaly_deg: 0 },
    LUNAR:   { label: 'Lunar orbit',            semiMajorAxis_km: 384400, eccentricity: 0, inclination_deg: 5.14, raan_deg: 0, argOfPerigee_deg: 0, trueAnomaly_deg: 0 },
};

// ---------------------------------------------------------------------------
// Link status thresholds
// ---------------------------------------------------------------------------

export const LINK_STATUS = {
    ACTIVE:   { label: 'Transmitting',   colour: 0x00ff44, colourHex: '#00ff44' },
    MARGINAL: { label: 'Marginal', colour: 0xffaa00, colourHex: '#ffaa00' },
    BROKEN:   { label: 'Broken',   colour: 0xff3344, colourHex: '#ff3344' },
    INACTIVE: { label: 'Inactive', colour: 0x666688, colourHex: '#666688' },
};

/** Link is marginal if margin < this many dB */
export const MARGINAL_THRESHOLD_DB = 3;

// ---------------------------------------------------------------------------
// UI colours
// ---------------------------------------------------------------------------

export const UI_COLOURS = {
    background: '#0a0a0f',
    panelBg: '#1a1a2e',
    panelBorder: '#2a2a3e',
    text: '#e0e0e8',
    textDim: '#888899',
    accent: '#4a9eff',
    accentLight: '#00d4ff',
};

// ---------------------------------------------------------------------------
// Camera presets (positions in scene units)
// ---------------------------------------------------------------------------

export const CAMERA_PRESETS = {
    EARTH_OVERVIEW:  { label: 'Earth Overview',   position: [0, 8, 25],   target: [0, 0, 0] },
    LEO:             { label: 'Low Earth Orbit',   position: [0, 5, 12],   target: [0, 0, 0] },
    GEO_BELT:        { label: 'GEO Belt',          position: [0, 20, 60],  target: [0, 0, 0] },
    CISLUNAR:        { label: 'Cislunar',           position: [0, 80, 200], target: [0, 0, 192] },
    LUNAR_SURFACE:   { label: 'Lunar Surface',      position: [0, 10, 390], target: [0, 0, 384.4] },
    SYDNEY:          { label: 'Sydney (Ground)',     position: [2.58, -3.50, -4.60], target: [2.55, -3.55, -4.64] },
};

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

/**
 * Convert geodetic lat/lon/alt to scene Cartesian coordinates.
 * @param {number} lat_deg  — latitude in degrees (-90 to 90)
 * @param {number} lon_deg  — longitude in degrees (-180 to 180)
 * @param {number} alt_km   — altitude above surface in km (default 0)
 * @returns {{x: number, y: number, z: number}} scene coordinates
 */
export function latLonAltToScene(lat_deg, lon_deg, alt_km = 0) {
    const lat = lat_deg * Math.PI / 180;
    const lon = lon_deg * Math.PI / 180;
    const R = (EARTH_RADIUS_KM + alt_km) / SCENE_SCALE_KM;
    return {
        x: R * Math.cos(lat) * Math.sin(lon),
        y: R * Math.sin(lat),
        z: R * Math.cos(lat) * Math.cos(lon),
    };
}

/**
 * Convert scene Cartesian coordinates to geodetic lat/lon/alt.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{lat_deg: number, lon_deg: number, alt_km: number}}
 */
export function sceneToLatLonAlt(x, y, z) {
    const R = Math.sqrt(x * x + y * y + z * z);
    const alt_km = R * SCENE_SCALE_KM - EARTH_RADIUS_KM;
    const lat = Math.asin(y / R);
    const lon = Math.atan2(x, z);
    return {
        lat_deg: lat * 180 / Math.PI,
        lon_deg: lon * 180 / Math.PI,
        alt_km,
    };
}

/**
 * Degrees to radians.
 */
export function deg2rad(d) { return d * Math.PI / 180; }

/**
 * Radians to degrees.
 */
export function rad2deg(r) { return r * 180 / Math.PI; }
