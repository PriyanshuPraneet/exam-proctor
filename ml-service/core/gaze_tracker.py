import cv2
import mediapipe as mp
import numpy as np

class GazeTracker:
    def __init__(self):
        print("Initializing Head Pose Gaze Tracker (MediaPipe)...")
        self.mp_face_mesh = mp.solutions.face_mesh
        
        # Initialize MediaPipe Face Mesh once
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True
        )
        
        # 3D model points (Nose tip, chin, left eye, right eye, left mouth, right mouth)
        self.landmark_ids = [1, 199, 33, 263, 61, 291]

    def predict(self, frame):
        """
        Takes a BGR numpy frame and returns (direction, pitch, yaw).
        """
        if frame is None:
            return "ERROR", 0.0, 0.0

        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        results = self.face_mesh.process(rgb)

        if not results.multi_face_landmarks:
            return "NO_FACE", 0.0, 0.0

        face_landmarks = results.multi_face_landmarks[0]

        face_2d = []
        face_3d = []

        for idx in self.landmark_ids:
            lm = face_landmarks.landmark[idx]
            x, y = int(lm.x * w), int(lm.y * h)
            
            face_2d.append([x, y])
            face_3d.append([x, y, lm.z])

        face_2d = np.array(face_2d, dtype=np.float64)
        face_3d = np.array(face_3d, dtype=np.float64)

        # Camera matrix
        focal_length = 1 * w
        cam_matrix = np.array([
            [focal_length, 0, w / 2],
            [0, focal_length, h / 2],
            [0, 0, 1]
        ])
        dist_matrix = np.zeros((4, 1), dtype=np.float64)

        # Solve PnP
        success, rot_vec, trans_vec = cv2.solvePnP(
            face_3d, face_2d, cam_matrix, dist_matrix
        )

        rmat, _ = cv2.Rodrigues(rot_vec)
        angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)

        pitch = angles[0] * 360
        yaw = angles[1] * 360
        # roll = angles[2] * 360 # Roll is usually not needed for basic proctoring

        # Direction Logic
        if yaw < -20:
            direction = "LOOKING_LEFT"
        elif yaw > 20:
            direction = "LOOKING_RIGHT"
        elif pitch < -20:
            direction = "LOOKING_DOWN"
        elif pitch > 20:
            direction = "LOOKING_UP"
        else:
            direction = "FOCUSED"

        return direction, pitch, yaw