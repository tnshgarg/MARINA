import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createGridMaterial, createParticleMaterial, HOLO_COLORS, updateMaterials } from './holographicMaterials.js';

/**
 * Scan-line + film-grain post-processing shader.
 * Applies faint horizontal scan lines modulated by time and a subtle
 * pseudo-random noise layer on top of the rendered frame.
 */
const ScanLineShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;

    // Simple pseudo-random hash for noise
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // --- Scan lines ---
      // Use gl_FragCoord.y so the lines are screen-space and scroll slowly.
      float scanFrequency = 800.0;
      float scanSpeed     = 3.0;
      float scanIntensity = 0.06;
      float scan = sin((gl_FragCoord.y + uTime * scanSpeed) * 3.14159 * 2.0 / scanFrequency);
      // Remap [-1,1] → [1-intensity, 1]
      scan = 1.0 - scanIntensity * (scan * 0.5 + 0.5);
      color.rgb *= scan;

      // --- Film grain (very subtle) ---
      float noise = rand(vUv + fract(uTime)) * 0.03;
      color.rgb += noise;

      gl_FragColor = color;
    }
  `,
};

/**
 * HolographicScene
 * Sets up the entire Three.js rendering pipeline with holographic aesthetics:
 *   • Transparent WebGL canvas (camera feed shows through via CSS)
 *   • Holographic grid floor
 *   • Floating ambient particles
 *   • Bloom + scan-line post-processing
 */
class HolographicScene {
  /**
   * @param {HTMLElement} container – DOM element the renderer canvas is appended to.
   */
  constructor(container) {
    this.container = container;

    // ---- Clock ----
    this.clock = new THREE.Clock();

    // ---- Scene ----
    this.scene = new THREE.Scene();
    this.scene.background = null; // transparent — camera feed shows through CSS

    // ---- Camera ----
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
    this.camera.position.set(0, 2, 5);
    this.camera.lookAt(0, 1, 0);

    // ---- Renderer ----
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    this.renderer.setClearColor(0x000000, 0); // fully transparent clear
    container.appendChild(this.renderer.domElement);

    // ---- Post-processing ----
    this.composer = new EffectComposer(this.renderer);

    // ---- Internal refs ----
    this.particles = null;
    this.particleMaterial = null;
    this.gridMesh = null;
    this.gridMaterial = null;
    this.videoElement = null;
    this.scanLinePass = null;
    this.bloomPass = null;

    // ---- Build the scene ----
    this.setupLighting();
    this.setupPostProcessing();
    this.setupGrid();
    this.setupParticles();

    // ---- Handle resize ----
    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  // ---------------------------------------------------------------------------
  // Lighting
  // ---------------------------------------------------------------------------

  setupLighting() {
    // Ambient fill — very dark blue tint
    const ambient = new THREE.AmbientLight(0x001122, 0.5);
    this.scene.add(ambient);

    // Primary holographic point light
    const pointPrimary = new THREE.PointLight(HOLO_COLORS.PRIMARY, 2);
    pointPrimary.position.set(3, 5, 3);
    this.scene.add(pointPrimary);

    // Secondary accent point light
    const pointSecondary = new THREE.PointLight(HOLO_COLORS.SECONDARY, 1.5);
    pointSecondary.position.set(-3, 3, -3);
    this.scene.add(pointSecondary);

    // Hemisphere for soft sky/ground gradation
    const hemi = new THREE.HemisphereLight(0x0044aa, 0x002211, 0.3);
    this.scene.add(hemi);
  }

  // ---------------------------------------------------------------------------
  // Post-processing
  // ---------------------------------------------------------------------------

  setupPostProcessing() {
    // 1. Render pass — draws the scene normally into the FBO
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0; // preserve transparency
    this.composer.addPass(renderPass);

    // 2. Unreal bloom — soft glow on bright elements
    const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.bloomPass = new UnrealBloomPass(resolution, 1.5, 0.4, 0.1);
    this.composer.addPass(this.bloomPass);

    // 3. Scan-line / film-grain pass
    this.scanLinePass = new ShaderPass(ScanLineShader);
    this.scanLinePass.uniforms.uTime.value = 0.0;
    this.composer.addPass(this.scanLinePass);
  }

  // ---------------------------------------------------------------------------
  // Holographic Grid Floor
  // ---------------------------------------------------------------------------

  setupGrid() {
    const geometry = new THREE.PlaneGeometry(40, 40);
    this.gridMaterial = createGridMaterial();
    this.gridMesh = new THREE.Mesh(geometry, this.gridMaterial);
    this.gridMesh.rotation.x = -Math.PI / 2;
    this.gridMesh.position.y = 0;
    this.scene.add(this.gridMesh);
  }

  // ---------------------------------------------------------------------------
  // Floating Particles
  // ---------------------------------------------------------------------------

  setupParticles() {
    const count = 500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3]     = (Math.random() - 0.5) * 16; // x ∈ (-8, 8)
      positions[i3 + 1] = 0.5 + Math.random() * 5.5;  // y ∈ (0.5, 6)
      positions[i3 + 2] = (Math.random() - 0.5) * 16; // z ∈ (-8, 8)
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.particleMaterial = createParticleMaterial();
    this.particles = new THREE.Points(geometry, this.particleMaterial);
    this.scene.add(this.particles);
  }

  // ---------------------------------------------------------------------------
  // Video Background (camera passthrough)
  // ---------------------------------------------------------------------------

  /**
   * The canvas is already transparent (alpha: true, background: null),
   * so the live camera feed is shown behind the canvas via CSS stacking.
   * We simply store the video element reference in case the HUD needs it.
   *
   * @param {HTMLVideoElement} videoElement
   */
  setupVideoBackground(videoElement) {
    this.videoElement = videoElement;
  }

  // ---------------------------------------------------------------------------
  // Per-frame Update
  // ---------------------------------------------------------------------------

  update() {
    const elapsed = this.clock.getElapsedTime();

    // Update holographic shader uniforms (grid pulse, particle glow, etc.)
    updateMaterials(elapsed);

    // Update scan-line time uniform
    if (this.scanLinePass) {
      this.scanLinePass.uniforms.uTime.value = elapsed;
    }

    // Animate particles — gentle upward drift with sin-wave wobble & wrap-around
    if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array;
      const count = positions.length / 3;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        // Slow upward drift (each particle gets a unique phase from its x/z)
        const phase = positions[i3] * 0.3 + positions[i3 + 2] * 0.5;
        positions[i3 + 1] += Math.sin(elapsed * 0.4 + phase) * 0.002 + 0.003;

        // Wrap: if above ceiling, reset to floor
        if (positions[i3 + 1] > 6.0) {
          positions[i3 + 1] = 0.5;
        }
      }

      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    // Render the composed frame
    this.composer.render();
  }

  // ---------------------------------------------------------------------------
  // Resize Handler
  // ---------------------------------------------------------------------------

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);

    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** @returns {THREE.Scene} */
  getScene() {
    return this.scene;
  }

  /** @returns {THREE.PerspectiveCamera} */
  getCamera() {
    return this.camera;
  }

  /** @returns {THREE.WebGLRenderer} */
  getRenderer() {
    return this.renderer;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy() {
    window.removeEventListener('resize', this._onResize);

    // Dispose particles
    if (this.particles) {
      this.particles.geometry.dispose();
    }
    if (this.particleMaterial) {
      this.particleMaterial.dispose();
    }

    // Dispose grid
    if (this.gridMesh) {
      this.gridMesh.geometry.dispose();
    }
    if (this.gridMaterial) {
      this.gridMaterial.dispose();
    }

    // Dispose post-processing
    if (this.composer) {
      // EffectComposer exposes renderTarget1 / renderTarget2
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }

    // Dispose renderer last
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }
}

export default HolographicScene;
