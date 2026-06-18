/**
 * gestureEngine.js — JARVIS LAB Gesture Recognition Engine
 *
 * Analyzes 21-point MediaPipe hand landmarks to classify hand poses
 * into discrete gestures (pinch, grab, fist, point, peace, thumbs-up,
 * open-palm, swipe) and supports two-hand scale detection.
 *
 * Coordinate system follows MediaPipe conventions:
 *   x ∈ [0, 1]  — left → right in camera frame
 *   y ∈ [0, 1]  — top  → bottom
 *   z            — depth (negative = closer to camera)
 */

// ---------------------------------------------------------------------------
// Gesture enum — every recognized gesture has a string constant
// ---------------------------------------------------------------------------
export const GESTURES = {
  NONE: 'none',
  PINCH: 'pinch',
  GRAB: 'grab',
  OPEN_PALM: 'open_palm',
  POINT: 'point',
  PEACE: 'peace',
  FIST: 'fist',
  SWIPE_LEFT: 'swipe_left',
  SWIPE_RIGHT: 'swipe_right',
  THUMBS_UP: 'thumbs_up'
};

// ---------------------------------------------------------------------------
// MediaPipe hand-landmark indices (0-20)
// ---------------------------------------------------------------------------
const LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20
};

// ---------------------------------------------------------------------------
// GestureEngine
// ---------------------------------------------------------------------------
class GestureEngine {
  /**
   * @param {Object} [options]
   * @param {number} [options.pinchThreshold=0.06]   — 3D distance below which
   *        thumb-tip ↔ index-tip counts as a pinch (normalised coords).
   * @param {number} [options.swipeThreshold=0.15]   — minimum wrist Δx within
   *        the time window to register a swipe.
   * @param {number} [options.swipeTimeWindow=300]   — ms window for swipe
   *        detection.
   */
  constructor({
    pinchThreshold = 0.06,
    swipeThreshold = 0.15,
    swipeTimeWindow = 300
  } = {}) {
    this.pinchThreshold = pinchThreshold;
    this.swipeThreshold = swipeThreshold;
    this.swipeTimeWindow = swipeTimeWindow;

    /** @type {{ position: {x:number,y:number,z:number}, timestamp: number }[]} */
    this.previousPositions = [];

    /** Current recognised gesture per hand */
    this.gestureState = {
      left: GESTURES.NONE,
      right: GESTURES.NONE
    };

    /** Live thumb-tip ↔ index-tip distance per hand */
    this.pinchDistance = { left: 1, right: 1 };

    /** Centre of the palm (average of key MCP joints) */
    this.palmCenter = { left: null, right: null };

    /** Midpoint between thumb-tip and index-tip (meaningful during pinch) */
    this.pinchMidpoint = { left: null, right: null };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * 3D Euclidean distance between two landmark points.
   * @param {{x:number, y:number, z:number}} p1
   * @param {{x:number, y:number, z:number}} p2
   * @returns {number}
   */
  static _distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * 3D midpoint between two landmark points.
   * @param {{x:number, y:number, z:number}} p1
   * @param {{x:number, y:number, z:number}} p2
   * @returns {{x:number, y:number, z:number}}
   */
  static _midpoint(p1, p2) {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
      z: (p1.z + p2.z) / 2
    };
  }

  /**
   * Determine whether a finger is extended.
   *
   * Uses a distance-based heuristic: the finger is considered extended when
   * the tip is farther from the wrist than the PIP joint is.  This is more
   * robust to hand rotation than a simple Y-axis comparison.
   *
   * @param {Array<{x:number,y:number,z:number}>} landmarks — 21-point array
   * @param {number} fingerTip  — landmark index of the finger tip
   * @param {number} fingerPip  — landmark index of the PIP joint
   * @param {number} fingerMcp  — landmark index of the MCP joint (unused
   *        in the primary check but kept for API symmetry / future use)
   * @returns {boolean}
   */
  isFingerExtended(landmarks, fingerTip, fingerPip, _fingerMcp) {
    const wrist = landmarks[LANDMARKS.WRIST];
    const tipDist = GestureEngine._distance(landmarks[fingerTip], wrist);
    const pipDist = GestureEngine._distance(landmarks[fingerPip], wrist);
    return tipDist > pipDist;
  }

  /**
   * Compute the centre of the palm as the average of five key landmarks.
   * @param {Array<{x:number,y:number,z:number}>} landmarks
   * @returns {{x:number, y:number, z:number}}
   */
  getPalmCenter(landmarks) {
    const indices = [
      LANDMARKS.WRIST,
      LANDMARKS.INDEX_MCP,
      LANDMARKS.MIDDLE_MCP,
      LANDMARKS.RING_MCP,
      LANDMARKS.PINKY_MCP
    ];

    let sx = 0, sy = 0, sz = 0;
    for (const i of indices) {
      sx += landmarks[i].x;
      sy += landmarks[i].y;
      sz += landmarks[i].z;
    }
    const n = indices.length;
    return { x: sx / n, y: sy / n, z: sz / n };
  }

  // -----------------------------------------------------------------------
  // Swipe detection (wrist-position history)
  // -----------------------------------------------------------------------

  /**
   * Record the current wrist position and prune old entries.
   * @param {{x:number,y:number,z:number}} wristPos
   * @private
   */
  _recordPosition(wristPos) {
    const now = performance.now();
    this.previousPositions.push({ position: wristPos, timestamp: now });

    // Keep at most 10 entries
    if (this.previousPositions.length > 10) {
      this.previousPositions.shift();
    }
  }

  /**
   * Look at recent wrist history and determine if a horizontal swipe occurred.
   * @returns {string|null}  GESTURES.SWIPE_LEFT, GESTURES.SWIPE_RIGHT, or null
   * @private
   */
  _detectSwipe() {
    if (this.previousPositions.length < 2) return null;

    const now = performance.now();
    const cutoff = now - this.swipeTimeWindow;

    // Find the oldest entry still within the time window
    const recent = this.previousPositions.filter(e => e.timestamp >= cutoff);
    if (recent.length < 2) return null;

    const oldest = recent[0];
    const newest = recent[recent.length - 1];
    const dx = newest.position.x - oldest.position.x;

    if (Math.abs(dx) >= this.swipeThreshold) {
      // Clear history so the swipe fires only once
      this.previousPositions = [];
      // Positive dx = hand moved right in camera space
      return dx > 0 ? GESTURES.SWIPE_RIGHT : GESTURES.SWIPE_LEFT;
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Main single-hand analysis
  // -----------------------------------------------------------------------

  /**
   * Analyse a single hand's 21 landmarks and classify the gesture.
   *
   * @param {Array<{x:number,y:number,z:number}>} landmarks — 21 MediaPipe
   *        hand landmarks.
   * @param {'Left'|'Right'} handedness — which hand (MediaPipe convention:
   *        the label is from the *camera's* perspective, so 'Left' in the
   *        result actually corresponds to the user's right hand in a
   *        selfie-mode feed — but we store the label as-is).
   * @returns {{
   *   gesture: string,
   *   pinchDistance: number,
   *   palmCenter: {x:number,y:number,z:number},
   *   pinchMidpoint: {x:number,y:number,z:number},
   *   fingersExtended: [boolean,boolean,boolean,boolean,boolean]
   * }}
   */
  analyze(landmarks, handedness) {
    const side = handedness === 'Left' ? 'left' : 'right';

    // ------------------------------------------------------------------
    // 1. Pinch distance (thumb tip ↔ index tip)
    // ------------------------------------------------------------------
    const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
    const indexTip = landmarks[LANDMARKS.INDEX_TIP];
    const currentPinchDist = GestureEngine._distance(thumbTip, indexTip);

    // ------------------------------------------------------------------
    // 2. Determine which fingers are extended  [thumb, index, middle, ring, pinky]
    // ------------------------------------------------------------------
    const thumbExtended = this._isThumbExtended(landmarks);

    const indexExtended = this.isFingerExtended(
      landmarks, LANDMARKS.INDEX_TIP, LANDMARKS.INDEX_PIP, LANDMARKS.INDEX_MCP
    );
    const middleExtended = this.isFingerExtended(
      landmarks, LANDMARKS.MIDDLE_TIP, LANDMARKS.MIDDLE_PIP, LANDMARKS.MIDDLE_MCP
    );
    const ringExtended = this.isFingerExtended(
      landmarks, LANDMARKS.RING_TIP, LANDMARKS.RING_PIP, LANDMARKS.RING_MCP
    );
    const pinkyExtended = this.isFingerExtended(
      landmarks, LANDMARKS.PINKY_TIP, LANDMARKS.PINKY_PIP, LANDMARKS.PINKY_MCP
    );

    const fingersExtended = [
      thumbExtended,
      indexExtended,
      middleExtended,
      ringExtended,
      pinkyExtended
    ];

    const extendedCount = fingersExtended.filter(Boolean).length;

    // ------------------------------------------------------------------
    // 3. Palm centre & pinch midpoint
    // ------------------------------------------------------------------
    const center = this.getPalmCenter(landmarks);
    const pinchMid = GestureEngine._midpoint(thumbTip, indexTip);

    // ------------------------------------------------------------------
    // 4. Record wrist position for swipe detection
    // ------------------------------------------------------------------
    this._recordPosition(landmarks[LANDMARKS.WRIST]);

    // ------------------------------------------------------------------
    // 5. Classify gesture (priority-ordered)
    // ------------------------------------------------------------------
    let gesture = GESTURES.NONE;

    // --- Swipe (takes priority — it's transient) ----------------------
    const swipe = this._detectSwipe();
    if (swipe) {
      gesture = swipe;
    }
    // --- Pinch ---------------------------------------------------------
    else if (
      currentPinchDist < this.pinchThreshold &&
      !(indexExtended && middleExtended && ringExtended && pinkyExtended)
    ) {
      gesture = GESTURES.PINCH;
    }
    // --- Fist (no fingers extended) ------------------------------------
    else if (extendedCount === 0) {
      gesture = GESTURES.FIST;
    }
    // --- Thumbs Up (only thumb extended, hand roughly vertical) --------
    else if (
      thumbExtended &&
      !indexExtended &&
      !middleExtended &&
      !ringExtended &&
      !pinkyExtended
    ) {
      // Additional verticality check: the thumb tip should be notably
      // above (lower Y) the wrist, and horizontal spread should be small.
      const wrist = landmarks[LANDMARKS.WRIST];
      const verticalDelta = wrist.y - thumbTip.y; // positive = thumb above wrist
      if (verticalDelta > 0.04) {
        gesture = GESTURES.THUMBS_UP;
      } else {
        // Thumb out but hand not vertical — fall through to NONE
        gesture = GESTURES.NONE;
      }
    }
    // --- Point (only index extended) -----------------------------------
    else if (
      indexExtended &&
      !middleExtended &&
      !ringExtended &&
      !pinkyExtended
    ) {
      gesture = GESTURES.POINT;
    }
    // --- Peace (index + middle only) -----------------------------------
    else if (
      indexExtended &&
      middleExtended &&
      !ringExtended &&
      !pinkyExtended
    ) {
      gesture = GESTURES.PEACE;
    }
    // --- Open Palm (all five fingers extended) -------------------------
    else if (extendedCount === 5) {
      gesture = GESTURES.OPEN_PALM;
    }
    // --- Grab (3–4 fingers partially curled — between fist & open) ----
    else if (extendedCount >= 1 && extendedCount <= 3) {
      // Heuristic: if some fingers are curled but not all, it looks like
      // a grab / claw pose.  We already handled point (1 ext) and peace
      // (2 ext) above, so reaching here means the *combination* of
      // extended fingers doesn't match a named pose → treat as grab.
      gesture = GESTURES.GRAB;
    }

    // ------------------------------------------------------------------
    // 6. Persist state
    // ------------------------------------------------------------------
    this.gestureState[side] = gesture;
    this.pinchDistance[side] = currentPinchDist;
    this.palmCenter[side] = center;
    this.pinchMidpoint[side] = pinchMid;

    return {
      gesture,
      pinchDistance: currentPinchDist,
      palmCenter: center,
      pinchMidpoint: pinchMid,
      fingersExtended
    };
  }

  // -----------------------------------------------------------------------
  // Two-hand analysis
  // -----------------------------------------------------------------------

  /**
   * Analyse a pair of hands for two-hand gestures (e.g. pinch-to-scale).
   *
   * @param {Array<{x:number,y:number,z:number}>} leftLandmarks  — 21 points
   * @param {Array<{x:number,y:number,z:number}>} rightLandmarks — 21 points
   * @returns {{
   *   gesture: string,
   *   scaleFactor: number,
   *   center: {x:number,y:number,z:number}
   * }}
   */
  analyzeTwoHands(leftLandmarks, rightLandmarks) {
    // Analyse each hand individually first (updates internal state)
    const leftResult = this.analyze(leftLandmarks, 'Left');
    const rightResult = this.analyze(rightLandmarks, 'Right');

    // Default return when no two-hand gesture is recognised
    const noGesture = { gesture: GESTURES.NONE, scaleFactor: 1, center: { x: 0.5, y: 0.5, z: 0 } };

    // ----- TWO_HAND_PINCH_SCALE ----------------------------------------
    // Both hands must be pinching.
    if (
      leftResult.gesture === GESTURES.PINCH &&
      rightResult.gesture === GESTURES.PINCH
    ) {
      const dist = GestureEngine._distance(
        leftResult.pinchMidpoint,
        rightResult.pinchMidpoint
      );

      // The scale factor is simply the distance between the two pinch
      // midpoints — the caller can compare successive frames to derive
      // a relative scale delta.
      const center = GestureEngine._midpoint(
        leftResult.pinchMidpoint,
        rightResult.pinchMidpoint
      );

      return {
        gesture: 'two_hand_pinch_scale',
        scaleFactor: dist,
        center
      };
    }

    return noGesture;
  }

  // -----------------------------------------------------------------------
  // State accessors
  // -----------------------------------------------------------------------

  /**
   * Return the current gesture state for both hands.
   * @returns {{ left: string, right: string }}
   */
  getGestureState() {
    return { ...this.gestureState };
  }

  /**
   * Reset all tracked state back to defaults.
   */
  reset() {
    this.previousPositions = [];
    this.gestureState = { left: GESTURES.NONE, right: GESTURES.NONE };
    this.pinchDistance = { left: 1, right: 1 };
    this.palmCenter = { left: null, right: null };
    this.pinchMidpoint = { left: null, right: null };
  }

  // -----------------------------------------------------------------------
  // Internal — thumb extension (special case)
  // -----------------------------------------------------------------------

  /**
   * The thumb doesn't curl the same way as the other four fingers so we
   * use a dedicated heuristic: the thumb tip should be farther from the
   * palm centre (index MCP) than the thumb IP joint is.
   *
   * @param {Array<{x:number,y:number,z:number}>} landmarks
   * @returns {boolean}
   * @private
   */
  _isThumbExtended(landmarks) {
    const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
    const thumbIp = landmarks[LANDMARKS.THUMB_IP];
    const indexMcp = landmarks[LANDMARKS.INDEX_MCP];

    const tipDist = GestureEngine._distance(thumbTip, indexMcp);
    const ipDist = GestureEngine._distance(thumbIp, indexMcp);
    return tipDist > ipDist;
  }
}

export default GestureEngine;
