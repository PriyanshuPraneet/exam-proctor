# ml-service/core/object_detector.py
from ultralytics import YOLO

class ObjectDetector:
    def __init__(self, model_path):
        print(f"📦 Loading Object Detector from {model_path}...")
        self.model = YOLO(model_path)
        
        # Load class names from the model (e.g., {0: 'person', 1: 'cell phone'})
        self.class_names = self.model.names 
        print(f"✅ Classes loaded: {self.class_names}")

    def predict(self, frame):
        """
        Runs inference on a single frame and returns a summary.
        """
        # conf=0.5 means we ignore weak detections
        results = self.model.predict(frame, conf=0.5, verbose=False)
        
        person_count = 0
        phone_detected = False
        
        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                label = self.class_names[cls_id]
                
                # IMPORTANT: Matches the names in your data.yaml
                if label == 'person':
                    person_count += 1
                elif label in ['cell phone', 'phone', 'mobile']:
                    phone_detected = True
                    
        return {
            "person_count": person_count,
            "phone_detected": phone_detected
        }