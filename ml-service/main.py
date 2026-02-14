# ml-service/main.py
import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from core.object_detector import ObjectDetector

app = FastAPI()

# Initialize the Object Detector
# Ensure 'best.pt' is inside the 'models' folder
try:
    detector = ObjectDetector("models/best.pt")
except Exception as e:
    print(f"❌ Critical Error: Could not load model. {e}")
    # We don't exit here to allow server to start, but it won't work correctly.

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

            # 3. Run Inference using our Core Module
            analysis = detector.predict(frame)
            
            # 4. Determine Status
            status = "clean"
            alerts = []

            # Logic: Phone Detected
            if analysis['phone_detected']:
                status = "violation"
                alerts.append("PHONE_DETECTED")
            
            # Logic: Multiple People
            if analysis['person_count'] > 1:
                status = "violation"
                alerts.append("MULTIPLE_PERSONS")

            # Logic: No Person (Optional warning)
            if analysis['person_count'] == 0:
                status = "warning"
                alerts.append("NO_FACE_DETECTED")

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