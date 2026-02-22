import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from core.object_detector import ObjectDetector
from core.gaze_tracker import GazeTracker 

app = FastAPI()

# Initialize the Object Detector and Gaze Tracker
try:
    detector = ObjectDetector("models/best.pt")
    gaze_tracker = GazeTracker()           
    print("✅ ML Models loaded successfully.")
except Exception as e:
    print(f"❌ Critical Error: Could not load model. {e}")

@app.websocket("/ws/monitor")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print(f"🔌 Client Connected: {websocket.client}")
    
    try:
        while True:
            # 1. Receive Frame (Bytes)
            data = await websocket.receive_bytes()
            
            # 2. Decode Image
            nparr = np.frombuffer(data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is None:
                continue

            # 3. Run Inference using our Core Modules
            analysis = detector.predict(frame)
            gaze_direction, pitch, yaw = gaze_tracker.predict(frame)
            
            # Attach gaze data to the analysis payload
            analysis['gaze_direction'] = gaze_direction
            analysis['pitch'] = round(pitch, 2)
            analysis['yaw'] = round(yaw, 2)
            
            # 4. Determine Status
            status = "clean"
            alerts = []

            # Logic: Phone Detected
            if analysis.get('phone_detected'):
                status = "violation"
                alerts.append("PHONE_DETECTED")
            
            # Logic: Multiple People
            if analysis.get('person_count', 0) > 1:
                status = "violation"
                alerts.append("MULTIPLE_PERSONS")

            # Logic: No Person
            if analysis.get('person_count', 0) == 0:
                status = "warning"
                alerts.append("NO_FACE_DETECTED")
                
            # Logic: Suspicious Gaze (Immediate trigger)
            if gaze_direction in ["LOOKING_LEFT", "LOOKING_RIGHT", "LOOKING_DOWN", "LOOKING_UP"]:
                if status == "clean":
                    status = "warning"
                alerts.append(f"SUSPICIOUS_GAZE: {gaze_direction}")
                
            # Logic: MediaPipe lost face, but YOLO sees a person
            if gaze_direction == "NO_FACE" and analysis.get('person_count', 0) > 0:
                 if status == "clean":
                     status = "warning"
                 alerts.append("FACE_NOT_VISIBLE")

            # 5. Send Response
            await websocket.send_json({
                "status": status,
                "alerts": alerts,
                "data": analysis
            })

    except WebSocketDisconnect:
        print("🔌 Client Disconnected")
    except Exception as e:
        print(f"⚠️ Error processing frame: {e}")
        try:
            await websocket.close()
        except:
            pass