import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import {
  ClockIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

const API_BASE_URL = "http://localhost:5000/api/exams";
const PROCTOR_API = "http://localhost:5000/api/proctor/log";
const ML_WS_URL = "ws://localhost:8000/ws/monitor"; // ML Service URL
const MAX_STRIKES = 3;

const ExamTakerPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const examCode = location.state?.examCode || sessionStorage.getItem("examCode");

  const fullscreenRef = useRef(null);
  const videoRef = useRef(null);
  
  // Refs for ML Service
  const wsRef = useRef(null);
  const canvasRef = useRef(document.createElement("canvas")); 
  const lastLogTimeRef = useRef(0);

  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const startCalledRef = useRef(false);

  // Debounce ref for WINDOW_BLUR — prevents false triggers from alert() popups
  // and OS notifications. Only fires if window stays blurred for > 1 second.
  const blurTimeoutRef = useRef(null);

  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // State for ML Alerts
  const [mlAlert, setMlAlert] = useState(null); 
  const [mlAlertType, setMlAlertType] = useState("warning"); // Tracks color (warning vs violation)

  /* =========================
     ML SERVICE INTEGRATION
  ========================= */
  const startMLMonitoring = () => {
    console.log("🔄 Attempting to connect to ML Service...");
    wsRef.current = new WebSocket(ML_WS_URL);

    wsRef.current.onopen = () => {
      console.log("✅ WebSocket Connected to ML Service");
    };

    wsRef.current.onmessage = (event) => {
      const response = JSON.parse(event.data);
      
      if (response.status === "violation" || response.status === "warning") {
        
        // 1. Identify what type of issue we are dealing with
        const isGazeIssue = response.alerts.some(a => a.includes("SUSPICIOUS_GAZE") || a.includes("GAZE_STRIKE"));
        const isFaceMissing = response.alerts.some(a => a.includes("FACE_NOT_VISIBLE"));
        const isHardViolation = response.status === "violation";

        // 2. Set the color state
        setMlAlertType(response.status); 

        // 3. Format the display text politely
        let displayText = "";
        if (isHardViolation && !isFaceMissing && !isGazeIssue) {
          // For phones, multiple people, etc.
          displayText = response.alerts.filter(a => !a.includes("SUSPICIOUS_GAZE") && !a.includes("GAZE_STRIKE")).join(", ");
        } else if (isFaceMissing) {
          displayText = "Face not visible. Please stay in front of the camera.";
        } else if (isGazeIssue) {
          displayText = "Please focus on the screen.";
        }

        setMlAlert(displayText);
        
        // 4. Log alerts to DB
        //
        // PHONE_DETECTED / MULTIPLE_PERSONS → log immediately (hard strikes)
        // GAZE_STRIKE / SUSPICIOUS_GAZE / FACE_NOT_VISIBLE → debounced every 5s (warning only, no strike)
        //
        const hasPhoneDetected = response.alerts.includes("PHONE_DETECTED");
        const hasMultiplePersons = response.alerts.includes("MULTIPLE_PERSONS");

        if (hasPhoneDetected) {
          handleViolation("PHONE_DETECTED");
        } else if (hasMultiplePersons) {
          handleViolation("MULTIPLE_PERSONS");
        } else {
          // Gaze warnings + face warnings — debounced, logged for organizer only (not strikes)
          const now = Date.now();
          if (now - lastLogTimeRef.current > 5000) {
            handleViolation(response.alerts[0]);
            lastLogTimeRef.current = now;
          }
        }
      } else {
        // Status is "clean"
        setMlAlert(null);
      }
    };

    wsRef.current.onerror = (err) => console.error("❌ ML WS Error:", err);
    wsRef.current.onclose = () => console.log("🔌 ML WS Connection Closed");
    
    const intervalId = setInterval(() => {
      sendFrameToML();
    }, 500);

    return () => {
      clearInterval(intervalId);
      if (wsRef.current) wsRef.current.close();
    };
  };

  const sendFrameToML = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!videoRef.current || videoRef.current.videoWidth === 0) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) wsRef.current.send(blob);
    }, "image/jpeg", 0.7);
  };

  /* =========================
     CAMERA
  ========================= */
  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });

    cameraStreamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      await videoRef.current.play();
    }
  };

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
  };

  /* =========================
     SCREEN SHARE (ENTIRE SCREEN)
  ========================= */
  const startScreenShare = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();

    if (settings.displaySurface !== "monitor") {
      stream.getTracks().forEach(t => t.stop());
      throw new Error("You must share the entire screen.");
    }

    screenStreamRef.current = stream;

    track.onended = () => {
      handleViolation("SCREEN_SHARE_STOPPED");
    };
  };

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
  };

  /* =========================
     FULLSCREEN + MEDIA START
  ========================= */
  const startProctoredExam = async () => {
    try {
      await startCamera();
      await startScreenShare();
      await fullscreenRef.current.requestFullscreen();
      setIsFullscreen(true);
      startMLMonitoring();
    } catch (err) {
      alert(err.message || "Permission denied");
      stopCamera();
      stopScreenShare();
    }
  };

  /* =========================
     FULLSCREEN EXIT DETECTION
  ========================= */
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && exam && !isSubmitted) {
        handleViolation("EXIT_FULLSCREEN");
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [exam, isSubmitted]);

  /* =========================
     TAB / WINDOW DETECTION
  ========================= */
  useEffect(() => {
    if (!exam || isSubmitted) return;

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") {
        handleViolation("TAB_SWITCH");
      }
    };

    const handleBlur = () => {
      // Debounce: only log WINDOW_BLUR if window stays blurred for > 1 second.
      blurTimeoutRef.current = setTimeout(() => {
        handleViolation("WINDOW_BLUR");
      }, 1000);
    };

    const handleFocus = () => {
      // Cancel if refocused within 1 second
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, [exam, isSubmitted]);

  /* =========================
     START EXAM (API ONLY)
  ========================= */
  useEffect(() => {
    const startExam = async () => {
      const token = localStorage.getItem("authToken");
      if (!token || !examCode) {
        setError("Invalid exam entry.");
        setLoading(false);
        return;
      }

      if (startCalledRef.current) return;
      startCalledRef.current = true;

      try {
        const { data } = await axios.post(
          `${API_BASE_URL}/start`,
          { examCode },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setExam(data.exam);
        setTimeLeft(data.exam.duration * 60);

        const init = {};
        data.exam.questions.forEach(q => (init[q._id] = ""));
        setAnswers(init);
      } catch (err) {
        setError(err.message || "Failed to start exam.");
      } finally {
        setLoading(false);
      }
    };

    startExam();

    return () => {
      stopCamera();
      stopScreenShare();
      if (wsRef.current) wsRef.current.close();
    };
  }, [examCode]);

  /* =========================
     TIMER
  ========================= */
  useEffect(() => {
    if (!exam || isSubmitted || timeLeft <= 0) return;

    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(t);
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(t);
  }, [exam, timeLeft, isSubmitted]);

  /* =========================
     VIOLATIONS
  ========================= */
  const handleViolation = async type => {
    if (!exam || isSubmitted) return;

    try {
      const token = localStorage.getItem("authToken");

      const res = await axios.post(
        PROCTOR_API,
        { examId: exam._id, type },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.strikes >= MAX_STRIKES) {
        alert("Maximum violations reached. Exam submitted.");
        handleSubmit(true);
      } else {
        // Silent types — UI overlay handles visual feedback, no alert() popup
        const silentTypes = [
          "SUSPICIOUS_GAZE", "FACE_NOT_VISIBLE", "NO_FACE",
          "WINDOW_BLUR", "GAZE_STRIKE", "PHONE", "MULTIPLE",
        ];
        const isSilent = silentTypes.some(s => type.includes(s));
        
        if (!isSilent) {
          alert(`⚠️ Violation detected: ${type}`);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  /* =========================
     SUBMIT
  ========================= */
  const handleSubmit = async timeout => {
    if (isSubmitted) return;
    setIsSubmitted(true);

    const token = localStorage.getItem("authToken");

    await axios.post(
      "http://localhost:5000/api/submissions",
      {
        examId: exam._id,
        answers: Object.entries(answers).map(([q, a]) => ({
          questionId: q,
          answer: a.trim(),
        })),
        timeout,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    stopCamera();
    stopScreenShare();
    if (wsRef.current) wsRef.current.close();
    sessionStorage.removeItem("examCode");

    alert("Exam submitted");
    navigate("/dashboard");
  };

  /* =========================
     UI
  ========================= */
  const formatTime = useMemo(() => {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [timeLeft]);

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center">
        Loading…
      </div>
    );

  if (error)
    return (
      <div className="p-8 max-w-lg mx-auto mt-20 bg-red-100 rounded">
        <XMarkIcon className="w-6 h-6 inline mr-2" />
        {error}
      </div>
    );

  const q = exam.questions[currentQuestionIndex];

  return (
    <div ref={fullscreenRef} className="min-h-screen bg-gray-50 relative">
      
      {/* --- ML ALERT OVERLAY --- */}
      {mlAlert && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[60] animate-pulse">
           <div className={`text-white px-6 py-4 rounded shadow-2xl flex items-center gap-3 border-4 border-white ${
               mlAlertType === "violation" ? "bg-red-600" : "bg-orange-500"
             }`}
           >
             <ExclamationTriangleIcon className="w-8 h-8" />
             <div>
               <h3 className="font-bold text-lg">
                 {mlAlertType === "violation" ? "PROCTORING ALERT" : "WARNING"}
               </h3>
               <p>{mlAlert}</p>
             </div>
           </div>
        </div>
      )}

      {!isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 text-white">
          <button
            onClick={startProctoredExam}
            className="px-8 py-4 bg-indigo-600 rounded text-xl font-bold"
          >
            Start Exam
          </button>
        </div>
      )}

      {/* Webcam preview - Updated Border Logic */}
      <video
        ref={videoRef}
        className={`fixed bottom-4 right-4 w-48 h-36 bg-black rounded z-40 object-cover transition-all duration-300 ${
            mlAlert 
              ? mlAlertType === "violation" 
                ? "border-4 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)]" 
                : "border-4 border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.8)]"
              : "border border-gray-300"
        }`}
      />

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between bg-white p-4 rounded shadow mb-6">
          <h1 className="text-2xl font-bold">{exam.title}</h1>
          <div className="font-mono text-lg">
            <ClockIcon className="w-6 h-6 inline" /> {formatTime}
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">
            Question {currentQuestionIndex + 1}/{exam.questions.length}
          </h2>

          <p className="mb-4">{q.questionText}</p>

          {q.type === "mcq" &&
            q.options.map((opt, i) => (
              <label key={i} className="block mb-2">
                <input
                  type="radio"
                  checked={answers[q._id] === opt}
                  onChange={() =>
                    setAnswers(p => ({ ...p, [q._id]: opt }))
                  }
                  className="mr-2"
                />
                {opt}
              </label>
            ))}

          {q.type === "text" && (
            <textarea
              rows="5"
              value={answers[q._id]}
              onChange={e =>
                setAnswers(p => ({ ...p, [q._id]: e.target.value }))
              }
              className="w-full border p-2 rounded"
            />
          )}

          <div className="flex justify-between mt-6">
            <button
              disabled={currentQuestionIndex === 0}
              onClick={() => setCurrentQuestionIndex(i => i - 1)}
              className="px-4 py-2 bg-gray-200 rounded"
            >
              <ChevronLeftIcon className="w-5 h-5 inline" /> Prev
            </button>

            <button
              disabled={
                currentQuestionIndex === exam.questions.length - 1
              }
              onClick={() => setCurrentQuestionIndex(i => i + 1)}
              className="px-4 py-2 bg-indigo-600 text-white rounded"
            >
              Next <ChevronRightIcon className="w-5 h-5 inline" />
            </button>
          </div>

          <button
            onClick={() => handleSubmit(false)}
            className="mt-6 w-full bg-red-600 text-white py-3 rounded font-bold"
          >
            <CheckIcon className="w-5 h-5 inline mr-2" />
            Submit Exam
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExamTakerPage;