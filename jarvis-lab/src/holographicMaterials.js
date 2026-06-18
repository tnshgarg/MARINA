/**
 * holographicMaterials.js
 * ----------------------
 * Custom Three.js materials that produce the Iron Man holographic aesthetic.
 * Every ShaderMaterial created here is tracked in a module-level array so that
 * `updateMaterials(time)` can pump the `uTime` uniform each frame.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------

export const HOLO_COLORS = {
  PRIMARY:    new THREE.Color(0x00f0ff),   // Cyan
  SECONDARY:  new THREE.Color(0x0080ff),   // Blue
  ACCENT:     new THREE.Color(0xff6600),   // Orange accent
  GRID:       new THREE.Color(0x003344),   // Dark grid
  GLOW:       new THREE.Color(0x00ccff),   // Glow
  WARNING:    new THREE.Color(0xff3300),   // Red warning
  SUCCESS:    new THREE.Color(0x00ff88),   // Green
  BACKGROUND: new THREE.Color(0x000a14),   // Very dark blue-black
};

// ---------------------------------------------------------------------------
// Internal registry – every shader material is pushed here on creation
// ---------------------------------------------------------------------------

const materials = [];

// ---------------------------------------------------------------------------
// createHolographicMaterial
// ---------------------------------------------------------------------------

/**
 * Creates a ShaderMaterial with Fresnel edge-glow, scrolling scan-lines and a
 * subtle flicker — the bread-and-butter hologram look.
 *
 * @param {object}  options
 * @param {THREE.Color} options.color      Base colour         (default PRIMARY)
 * @param {number}      options.opacity    Overall opacity      (default 0.7)
 * @param {boolean}     options.wireframe  Wireframe toggle     (default false)
 * @param {boolean}     options.animated   Animate over time    (default true)
 * @param {boolean}     options.scanLines  Show scan-lines      (default true)
 * @returns {THREE.ShaderMaterial}
 */
export function createHolographicMaterial(options = {}) {
  const {
    color     = HOLO_COLORS.PRIMARY,
    opacity   = 0.7,
    wireframe = false,
    animated  = true,
    scanLines = true,
  } = options;

  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vUv       = uv;
      vPosition = position;
      vNormal   = normalize(normalMatrix * normal);

      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPosition.xyz);

      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3  uColor;
    uniform float uOpacity;
    uniform bool  uScanLines;

    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      // --- Fresnel edge-glow -------------------------------------------
      float fresnel = 1.0 - abs(dot(vViewDir, vNormal));
      fresnel = pow(fresnel, 2.0);
      float fresnelFactor = 0.4 + 0.6 * fresnel;

      // --- Scan lines --------------------------------------------------
      float scanLine = 1.0;
      if (uScanLines) {
        scanLine = sin(vPosition.y * 80.0 + uTime * 2.0) * 0.5 + 0.5;
        scanLine = 0.7 + 0.3 * scanLine;           // keep a baseline brightness
      }

      // --- Subtle flicker ----------------------------------------------
      float flicker = 0.95 + 0.05 * sin(uTime * 10.0);

      // --- Combine -----------------------------------------------------
      vec3 finalColor = uColor * fresnelFactor * scanLine * flicker;
      float finalAlpha = uOpacity * fresnelFactor * flicker;

      gl_FragColor = vec4(finalColor, finalAlpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:      { value: 0.0 },
      uColor:     { value: new THREE.Color(color) },
      uOpacity:   { value: opacity },
      uScanLines: { value: scanLines },
    },
    vertexShader,
    fragmentShader,
    transparent:  true,
    wireframe,
    side:         THREE.DoubleSide,
    depthWrite:   false,
    blending:     THREE.AdditiveBlending,
  });

  // Tag so updateMaterials knows whether to animate
  material.userData.animated = animated;
  materials.push(material);

  return material;
}

// ---------------------------------------------------------------------------
// createWireframeMaterial
// ---------------------------------------------------------------------------

/**
 * Lightweight wireframe material for quick structural overlays.
 *
 * @param {THREE.Color} color
 * @returns {THREE.MeshBasicMaterial}
 */
export function createWireframeMaterial(color = HOLO_COLORS.PRIMARY) {
  const material = new THREE.MeshBasicMaterial({
    color,
    wireframe:   true,
    transparent: true,
    opacity:     0.3,
    blending:    THREE.AdditiveBlending,
  });

  return material;
}

// ---------------------------------------------------------------------------
// createEdgeGlowMaterial
// ---------------------------------------------------------------------------

/**
 * Thin glowing-line material intended for use with `THREE.EdgesGeometry`.
 *
 * @param {THREE.Color} color
 * @returns {THREE.ShaderMaterial}
 */
export function createEdgeGlowMaterial(color = HOLO_COLORS.PRIMARY) {
  const vertexShader = /* glsl */ `
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3  uColor;

    void main() {
      float pulse = 0.6 + 0.4 * sin(uTime * 3.0);
      gl_FragColor = vec4(uColor * pulse, pulse);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:  { value: 0.0 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });

  material.userData.animated = true;
  materials.push(material);

  return material;
}

// ---------------------------------------------------------------------------
// createGridMaterial
// ---------------------------------------------------------------------------

/**
 * Floor-grid material with major / minor lines and circular distance fade.
 *
 * @returns {THREE.ShaderMaterial}
 */
export function createGridMaterial() {
  const vertexShader = /* glsl */ `
    varying vec3 vWorldPos;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  // Grid colours baked as uniforms so they stay in sync with the palette.
  const minorColor = HOLO_COLORS.GRID;
  const majorColor = HOLO_COLORS.PRIMARY.clone().multiplyScalar(0.3);

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3  uMinorColor;
    uniform vec3  uMajorColor;

    varying vec3 vWorldPos;

    float gridLine(float coord, float lineWidth) {
      float f = abs(fract(coord - 0.5) - 0.5);
      return 1.0 - smoothstep(0.0, lineWidth, f);
    }

    void main() {
      // --- Minor grid (every 0.25 units) --------------------------------
      float minorX = gridLine(vWorldPos.x * 4.0, 0.05);
      float minorZ = gridLine(vWorldPos.z * 4.0, 0.05);
      float minor  = max(minorX, minorZ);

      // --- Major grid (every 1 unit) ------------------------------------
      float majorX = gridLine(vWorldPos.x, 0.04);
      float majorZ = gridLine(vWorldPos.z, 0.04);
      float major  = max(majorX, majorZ);

      // --- Distance fade (circular) -------------------------------------
      float dist = length(vWorldPos.xz);
      float fade = 1.0 - smoothstep(5.0, 20.0, dist);

      // --- Combine -------------------------------------------------------
      vec3 color = uMinorColor * minor + uMajorColor * major;
      float alpha = max(minor * 0.4, major * 0.8) * fade;

      gl_FragColor = vec4(color * fade, alpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:       { value: 0.0 },
      uMinorColor: { value: minorColor },
      uMajorColor: { value: majorColor },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite:  false,
    side:        THREE.DoubleSide,
    blending:    THREE.AdditiveBlending,
  });

  material.userData.animated = true;
  materials.push(material);

  return material;
}

// ---------------------------------------------------------------------------
// createParticleMaterial
// ---------------------------------------------------------------------------

/**
 * PointsMaterial with a programmatic soft-circle sprite texture.
 *
 * @returns {THREE.PointsMaterial}
 */
export function createParticleMaterial() {
  // --- Generate a 64×64 radial-gradient circle texture ------------------
  const size   = 64;
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)');
  gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const map = new THREE.CanvasTexture(canvas);

  // --- Material ---------------------------------------------------------
  const material = new THREE.PointsMaterial({
    color:           HOLO_COLORS.PRIMARY,
    size:            0.03,
    transparent:     true,
    opacity:         0.6,
    blending:        THREE.AdditiveBlending,
    sizeAttenuation: true,
    map,
    depthWrite:      false,
  });

  return material;
}

// ---------------------------------------------------------------------------
// updateMaterials
// ---------------------------------------------------------------------------

/**
 * Pump the `uTime` uniform for every tracked ShaderMaterial.
 * Call once per frame with `clock.getElapsedTime()`.
 *
 * @param {number} time  Elapsed time in seconds.
 */
export function updateMaterials(time) {
  for (let i = 0; i < materials.length; i++) {
    const mat = materials[i];

    // Skip disposed materials – clean them out of the list.
    if (mat === null || mat === undefined) continue;

    if (mat.userData.animated !== false && mat.uniforms && mat.uniforms.uTime) {
      mat.uniforms.uTime.value = time;
    }
  }
}
