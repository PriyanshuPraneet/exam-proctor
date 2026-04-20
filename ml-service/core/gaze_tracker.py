# core/gaze_tracker.py
import cv2
import numpy as np
import mediapipe as mp

# ── Safe-zone leniency ────────────────────────────────────────────────────────
# How much to expand the calibrated zone outward on each side (as a fraction
# of the measured span). Increase for more tolerance, decrease for strictness.
YAW_LENIENCY   = 0.30
PITCH_LENIENCY = 0.20


class GazeTracker:
    def __init__(self):
        print("🚀 Initializing Robust Gaze Tracker...")

        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh    = self.mp_face_mesh.FaceMesh(
            refine_landmarks=True,          # MUST be True — iris points 469-477 only exist here
            max_num_faces=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        self.prev_pitch = None
        self.prev_yaw   = None
        # ── EMA weight on NEW value.
        # 0.25 = heavy smoothing (good for stable gaze reading).
        # Lower = more lag but less flicker. Don't go above 0.4.
        self.alpha = 0.25

        self.is_calibrated = False
        self.safe_zone     = {}
        self.calib_buffer  = {}

        # Majority-vote window.
        # 5 frames, require 3/5 agreement — suppresses noise while still
        # reacting within ~150 ms at 30 fps.
        self.gaze_history = []
        self.history_size = 3

    # ── Landmark indices ──────────────────────────────────────────────────────
    # Iris indices are only present when refine_landmarks=True (478-point mesh)
    LEFT_IRIS  = [474, 475, 476, 477]
    RIGHT_IRIS = [469, 470, 471, 472]
    LEFT_EYE   = [33,  133]   # medial / lateral canthus
    RIGHT_EYE  = [362, 263]   # medial / lateral canthus

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _get_landmarks(self, frame):
        """Return the first face landmark object, or None if no face found."""
        rgb    = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.face_mesh.process(rgb)
        if not result.multi_face_landmarks:
            return None
        return result.multi_face_landmarks[0]

    def _iris_center(self, lm, indices, w, h):
        """Mean pixel position of the given iris landmark ring."""
        pts = [(lm.landmark[i].x * w, lm.landmark[i].y * h) for i in indices]
        return np.mean(pts, axis=0)

    def _eye_corners(self, lm, indices, w, h):
        """Pixel positions of two eye-corner landmarks."""
        return [(lm.landmark[i].x * w, lm.landmark[i].y * h) for i in indices]

    def _compute_gaze(self, frame):
        """
        Compute (pitch, yaw) from a BGR frame.

        ── Flip contract ────────────────────────────────────────────────────
        This method operates on the frame EXACTLY as given.  The caller is
        responsible for flipping before calling if a mirror view is needed.
        Both add_calibration_frame() and predict() flip the frame themselves
        BEFORE calling _compute_gaze(), so calibration and monitoring are
        always measured on the same orientation.  Previously predict() flipped
        but add_calibration_frame() did not — that mismatch caused the safe
        zone computed during calibration to be the mirror image of what the
        monitor saw, making the tracker systematically wrong.

        ── Yaw ──────────────────────────────────────────────────────────────
        Iris horizontal ratio within the eye socket (0 = medial, 1 = lateral).
        Averaged over both eyes for robustness.

        ── Pitch ────────────────────────────────────────────────────────────
        Vertical iris offset from the eye-corner midline, normalised by the
        inter-canthus distance (eye width).  This removes the dependency on
        camera distance and face size — the original /50 magic number broke
        for people sitting close or far from the camera.

        Returns (pitch, yaw) or (None, None) on failure.
        """
        h, w = frame.shape[:2]

        lm = self._get_landmarks(frame)
        if lm is None:
            return None, None

        # Guard: refine_landmarks=True produces exactly 478 points.
        if len(lm.landmark) < 478:
            print(f"⚠️ Only {len(lm.landmark)} landmarks — iris unavailable.")
            return None, None

        try:
            left_iris  = self._iris_center(lm, self.LEFT_IRIS,  w, h)
            right_iris = self._iris_center(lm, self.RIGHT_IRIS, w, h)
            left_eye   = self._eye_corners(lm, self.LEFT_EYE,   w, h)
            right_eye  = self._eye_corners(lm, self.RIGHT_EYE,  w, h)

            # ── Yaw ───────────────────────────────────────────────────────
            left_eye_w = np.linalg.norm(np.array(left_eye[0]) - np.array(left_eye[1]))
            right_eye_w = np.linalg.norm(np.array(right_eye[0]) - np.array(right_eye[1]))

            # Degenerate frame — face too turned / eye occluded
            if left_eye_w < 5.0 or right_eye_w < 5.0: # Increased threshold
                return None, None

            left_ratio = (left_iris[0] - left_eye[0][0]) / left_eye_w
            right_ratio = (right_iris[0] - right_eye[0][0]) / right_eye_w
            yaw = (left_ratio + right_ratio) / 2.0

            # ── Pitch — normalised by eye width, not a magic pixel constant ──
            # Using eye width as the normaliser makes pitch scale-invariant:
            # the same physical gaze angle gives the same pitch value regardless
            # of face size or camera distance.
            left_mid_y = (left_eye[0][1] + left_eye[1][1]) / 2.0
            right_mid_y = (right_eye[0][1] + right_eye[1][1]) / 2.0
            left_v = (left_iris[1] - left_mid_y) / left_eye_w
            right_v = (right_iris[1] - right_mid_y) / right_eye_w
            pitch = (left_v + right_v) / 2.0

            # ── EMA smoothing ─────────────────────────────────────────────
            if self.prev_pitch is None:
                self.prev_pitch = pitch
                self.prev_yaw   = yaw
            else:
                pitch = self.alpha * pitch + (1.0 - self.alpha) * self.prev_pitch
                yaw   = self.alpha * yaw   + (1.0 - self.alpha) * self.prev_yaw
                self.prev_pitch = pitch
                self.prev_yaw   = yaw

            return float(pitch), float(yaw)

        except Exception as e:
            print(f"Gaze calculation error: {e}")
            return None, None

    # ── Calibration API ───────────────────────────────────────────────────────

    def reset_calibration(self):
        """Call between exam sessions so each student starts fresh."""
        self.is_calibrated = False
        self.safe_zone     = {}
        self.calib_buffer  = {}
        self.prev_pitch    = None
        self.prev_yaw      = None
        self.gaze_history  = []

    def add_calibration_frame(self, frame, point_id: str):
        """
        Accumulate pitch/yaw readings for one calibration point.

        ⚠️  Frame is flipped HERE (same as predict) so that calibration and
        monitoring are always measured on the same mirror orientation.
        Returns (face_detected, pitch, yaw).
        """
        # ── Flip before measuring — SAME orientation as predict() ────────
        flipped = cv2.flip(frame, 1)
        pitch, yaw = self._compute_gaze(flipped)
        face_detected = pitch is not None

        if not face_detected:
            return False, 0.0, 0.0

        if point_id not in self.calib_buffer:
            self.calib_buffer[point_id] = {"pitches": [], "yaws": []}

        self.calib_buffer[point_id]["pitches"].append(pitch)
        self.calib_buffer[point_id]["yaws"].append(yaw)

        return True, float(pitch), float(yaw)

    def finalize_calibration(self) -> dict:
        """
        Compute the personalised safe zone from the 5-point buffer using
        median values (robust to outlier frames).
        """
        buf = self.calib_buffer

        def get_med(ids, key):
            vals = []
            for pid in ids:
                if pid in buf:
                    vals.extend(buf[pid][key])
            return float(np.median(vals)) if vals else 0.0

        # LEFT dots define yaw_min, RIGHT dots define yaw_max.
        # TOP dots define pitch_min (eyes up = negative pitch), BOTTOM define pitch_max.
        y_min = get_med(["TOP_LEFT",  "BOTTOM_LEFT"],  "yaws")
        y_max = get_med(["TOP_RIGHT", "BOTTOM_RIGHT"], "yaws")
        p_min = get_med(["TOP_LEFT",  "TOP_RIGHT"],    "pitches")
        p_max = get_med(["BOTTOM_LEFT","BOTTOM_RIGHT"],"pitches")

        # Ensure correct ordering regardless of head position during calibration
        y_min, y_max = min(y_min, y_max), max(y_min, y_max)
        p_min, p_max = min(p_min, p_max), max(p_min, p_max)

        # Enforce a minimum span so a very steady user doesn't get a zero-size zone.
        # With the normalised pitch formula, 0.05 is a reasonable minimum.
        y_span = max(y_max - y_min, 0.25)
        p_span = max(p_max - p_min, 0.15)

        self.safe_zone = {
            "yaw_min":   y_min - (y_span * YAW_LENIENCY),
            "yaw_max":   y_max + (y_span * YAW_LENIENCY),
            "pitch_min": p_min - (p_span * PITCH_LENIENCY),
            "pitch_max": p_max + (p_span * PITCH_LENIENCY),
        }

        self.is_calibrated = True
        print("✅ Calibration finalised:", self.safe_zone)
        return self.safe_zone

    def set_calibration(self, safe_zone: dict):
        """Directly inject a pre-computed safe_zone (called from /ws/monitor)."""
        if safe_zone:
            self.safe_zone     = safe_zone
            self.is_calibrated = True
            print("🎯 Safe zone injected:", safe_zone)
        else:
            print("⚠️ Received empty safe zone — calibration not set.")

    # ── Proctoring prediction ─────────────────────────────────────────────────

    def predict(self, frame):
        """
        Returns (status, pitch, yaw).

        Status values:
            NO_FACE        — no face detected
            NOT_CALIBRATED — face found but safe zone not set
            FOCUSED        — gaze inside calibrated safe zone
            LOOKING_LEFT / LOOKING_RIGHT / LOOKING_UP / LOOKING_DOWN

        Frame is flipped here — same as add_calibration_frame — so both
        always measure the same orientation.  All timing / strike logic lives
        in main.py; this method only reports current gaze direction.
        """
        # ── Flip — must match add_calibration_frame ───────────────────────
        flipped    = cv2.flip(frame, 1)
        pitch, yaw = self._compute_gaze(flipped)

        if pitch is None:
            self.gaze_history = []
            return "NO_FACE", 0.0, 0.0

        if not self.is_calibrated:
            return "NOT_CALIBRATED", float(pitch), float(yaw)

        sz = self.safe_zone

        # Raw direction from calibrated boundaries
        if   yaw   < sz["yaw_min"]:   raw = "LOOKING_LEFT"
        elif yaw   > sz["yaw_max"]:   raw = "LOOKING_RIGHT"
        elif pitch < sz["pitch_min"]: raw = "LOOKING_UP"
        elif pitch > sz["pitch_max"]: raw = "LOOKING_DOWN"
        else:                         raw = "FOCUSED"

        # Majority-vote over last 5 frames — require 3/5 to agree.
        # This suppresses flicker while reacting to real gaze shifts in ~2 frames.
        self.gaze_history.append(raw)
        if len(self.gaze_history) > self.history_size:
            self.gaze_history.pop(0)

        stable = max(set(self.gaze_history), key=self.gaze_history.count)
        return stable, float(pitch), float(yaw)