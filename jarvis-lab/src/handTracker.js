/**
 * handTracker.js — MediaPipe Hand Landmark Detection Module
 *
 * Manages webcam access and real-time hand landmark detection using
 * MediaPipe's HandLandmarker task. Supports tracking up to two hands
 * simultaneously with GPU-accelerated inference.
 *
 * @module handTracker
 */

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

/* ── CDN asset paths ─────────────────────────────────────────────── */

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_CDN =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/* ── Camera constraints ──────────────────────────────────────────── */

const VIDEO_CONSTRAINTS = {
  video: {
    width: 1280,
    height: 720,
    facingMode: 'user',
  },
};

/**
 * HandTracker — webcam + MediaPipe hand landmark detection.
 *
 * Usage:
 * ```js
 * const tracker = new HandTracker(videoEl);
 * await tracker.init();
 * await tracker.startCamera();
 * // inside rAF loop:
 * tracker.detect(performance.now());
 * ```
 */
class HandTracker {
  /**
   * @param {HTMLVideoElement} videoElement — the <video> element that
   *   will receive the camera stream and be fed to MediaPipe.
   */
  constructor(videoElement) {
    /** @type {HTMLVideoElement} */
    this.videoElement = videoElement;

    /** @type {HandLandmarker|null} */
    this.handLandmarker = null;

    /** @type {Object|null} Most recent detection results. */
    this.results = null;

    /** @type {boolean} Whether detection is actively running. */
    this.isRunning = false;

    /** @type {Function|null} Optional callback invoked on every detection. */
    this.onResultsCallback = null;
  }

  /* ── Initialisation ──────────────────────────────────────────── */

  /**
   * Initialise the MediaPipe HandLandmarker.
   *
   * Downloads the WASM runtime and the float16 hand-landmarker model
   * from the CDN, then creates the landmarker instance configured for
   * VIDEO running-mode with GPU delegate.
   *
   * @returns {Promise<void>}
   */
  async init() {
    // Resolve the vision WASM fileset first — required by all vision tasks.
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_CDN,
        delegate: 'GPU',
      },
      numHands: 2,
      runningMode: 'VIDEO',
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    console.log('[HandTracker] MediaPipe HandLandmarker initialised.');
  }

  /* ── Camera ──────────────────────────────────────────────────── */

  /**
   * Request the user-facing webcam and pipe it into the video element.
   *
   * Resolves once the first frame of video data has loaded, meaning
   * the stream dimensions are known and detection can begin.
   *
   * @returns {Promise<void>}
   */
  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
    this.videoElement.srcObject = stream;

    // Wait until the browser has decoded at least one frame.
    await new Promise((resolve) => {
      this.videoElement.addEventListener('loadeddata', resolve, { once: true });
    });

    this.isRunning = true;
    console.log('[HandTracker] Camera stream active.');
  }

  /* ── Detection ───────────────────────────────────────────────── */

  /**
   * Run hand-landmark detection on the current video frame.
   *
   * Must be called inside a `requestAnimationFrame` loop with the
   * rAF-provided timestamp so MediaPipe can correlate frames.
   *
   * @param {number} timestamp — `performance.now()` or rAF timestamp.
   * @returns {{ landmarks: Array, worldLandmarks: Array, handedness: Array }|null}
   */
  detect(timestamp) {
    if (!this.handLandmarker) return null;

    this.results = this.handLandmarker.detectForVideo(this.videoElement, timestamp);

    // Fire the user-supplied callback, if any.
    if (this.onResultsCallback) {
      this.onResultsCallback(this.results);
    }

    return {
      landmarks: this.results.landmarks,
      worldLandmarks: this.results.worldLandmarks,
      handedness: this.results.handedness,
    };
  }

  /* ── Callbacks ───────────────────────────────────────────────── */

  /**
   * Register a callback that fires every time `detect()` produces results.
   *
   * @param {Function} callback — receives the raw MediaPipe results object.
   */
  onResults(callback) {
    this.onResultsCallback = callback;
  }

  /* ── Accessors ───────────────────────────────────────────────── */

  /**
   * How many hands are currently detected.
   *
   * @returns {number} 0, 1, or 2.
   */
  getHandCount() {
    if (!this.results || !this.results.landmarks) return 0;
    return this.results.landmarks.length;
  }

  /**
   * Normalised 2-D landmarks (x, y, z in 0-1 range relative to frame).
   *
   * @param {number} [handIndex=0] — which hand (0 or 1).
   * @returns {Array|null} 21-element landmark array, or null.
   */
  getLandmarks(handIndex = 0) {
    if (!this.results || !this.results.landmarks) return null;
    return this.results.landmarks[handIndex] ?? null;
  }

  /**
   * World-space 3-D landmarks (metres, origin at hand geometric centre).
   *
   * @param {number} [handIndex=0] — which hand (0 or 1).
   * @returns {Array|null} 21-element world-landmark array, or null.
   */
  getWorldLandmarks(handIndex = 0) {
    if (!this.results || !this.results.worldLandmarks) return null;
    return this.results.worldLandmarks[handIndex] ?? null;
  }

  /**
   * Handedness label for the specified hand.
   *
   * MediaPipe mirrors the label (camera-view), so "Left" means the
   * user's left hand as seen through the front-facing camera.
   *
   * @param {number} [handIndex=0] — which hand (0 or 1).
   * @returns {'Left'|'Right'|null}
   */
  getHandedness(handIndex = 0) {
    if (!this.results || !this.results.handedness) return null;
    const entry = this.results.handedness[handIndex];
    if (!entry || entry.length === 0) return null;
    return entry[0].categoryName;
  }

  /* ── Teardown ────────────────────────────────────────────────── */

  /**
   * Release all resources: stop the webcam stream and close the
   * MediaPipe landmarker to free GPU / WASM memory.
   */
  destroy() {
    // Stop every track on the video's media stream.
    if (this.videoElement.srcObject) {
      this.videoElement.srcObject.getTracks().forEach((track) => track.stop());
      this.videoElement.srcObject = null;
    }

    // Close the landmarker (frees WASM + GPU resources).
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }

    this.isRunning = false;
    this.results = null;
    console.log('[HandTracker] Destroyed — all resources released.');
  }
}

export default HandTracker;
