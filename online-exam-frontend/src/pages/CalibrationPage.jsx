// CalibrationPage.jsx
// Place this in: online-exam-frontend/src/pages/CalibrationPage.jsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  EyeSlashIcon,
  DevicePhoneMobileIcon,
  SpeakerWaveIcon,
  ComputerDesktopIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

const CALIB_WS_URL    = "ws://localhost:8000/ws/calibrate";
const FRAMES_PER_POINT = 20;

const CALIB_POINTS = [
  { id: "TOP_LEFT",     label: "Top-Left Corner",     style: { left: 40,    top: 40    } },
  { id: "TOP_RIGHT",    label: "Top-Right Corner",    style: { right: 40,   top: 40    } },
  { id: "BOTTOM_LEFT",  label: "Bottom-Left Corner",  style: { left: 40,    bottom: 40 } },
  { id: "BOTTOM_RIGHT", label: "Bottom-Right Corner", style: { right: 40,   bottom: 40 } },
  { id: "CENTER",       label: "Center",              style: { left: "50%", top: "50%", transform: "translate(-50%, -50%)" } },
];

// Rules shown on the first screen
const RULES = [
  { icon: DevicePhoneMobileIcon,   color: "text-red-400",    text: "Do not use or display your phone during the exam." },
  { icon: EyeSlashIcon,            color: "text-orange-400", text: "Keep your eyes on the screen at all times." },
  { icon: SpeakerWaveIcon,         color: "text-yellow-400", text: "Do not speak or make noise during the exam." },
  { icon: UserGroupIcon,           color: "text-purple-400", text: "Only you should be visible on camera." },
  { icon: ComputerDesktopIcon,     color: "text-blue-400",   text: "Do not switch tabs or exit fullscreen." },
  { icon: ShieldExclamationIcon,   color: "text-green-400",  text: "Any violations will be recorded and reviewed." },
];

const PHASE = {
  RULES:      "RULES",       // ← new: rules screen
  INTRO:      "INTRO",       // calibration instructions
  READY:      "READY",       // "look at the dot now" — waiting for user to click Capture
  CAPTURING:  "CAPTURING",   // actively collecting frames
  POINT_DONE: "POINT_DONE",  // dot captured, waiting for user to click Next
  PROCESSING: "PROCESSING",
  DONE:       "DONE",
  ERROR:      "ERROR",
};

export default function CalibrationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const examCode = location.state?.examCode || sessionStorage.getItem("examCode");

  const containerRef = useRef(null);
  const videoRef     = useRef(null);
  const canvasRef    = useRef(document.createElement("canvas"));
  const wsRef        = useRef(null);
  const streamRef    = useRef(null);
  const isMounted    = useRef(true);
  const loopStopRef  = useRef(null);

  const [phase,        setPhase]        = useState(PHASE.RULES);
  const [pointIdx,     setPointIdx]     = useState(0);
  const [frameCount,   setFrameCount]   = useState(0);
  const [retryMsg,     setRetryMsg]     = useState("");
  const [errorMsg,     setErrorMsg]     = useState("");
  const [completedIds, setCompletedIds] = useState([]);
  const [cameraReady,  setCameraReady]  = useState(false);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const enterFullscreen = useCallback(async () => {
    try {
      if (containerRef.current && !document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      }
    } catch (_) {}
  }, []);

  // ── Camera ────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject   = stream;
        videoRef.current.muted       = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setErrorMsg("Camera permission denied. Please allow camera access and reload.");
      setPhase(PHASE.ERROR);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const openWebSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      const ws     = new WebSocket(CALIB_WS_URL);
      ws.binaryType = "arraybuffer";
      ws.onopen    = () => resolve(ws);
      ws.onerror   = () => reject(new Error("Cannot connect to ML service."));
      wsRef.current = ws;
    });
  }, []);

  // ── Send one frame as base64 JSON ─────────────────────────────────────────
  const sendFrame = useCallback((pointId) => {
    return new Promise((resolve) => {
      const ws  = wsRef.current;
      const vid = videoRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return resolve();
      if (!vid || vid.videoWidth === 0) return resolve();

      const canvas  = canvasRef.current;
      canvas.width  = vid.videoWidth;
      canvas.height = vid.videoHeight;
      canvas.getContext("2d").drawImage(vid, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) return resolve();
        const reader      = new FileReader();
        reader.onloadend  = () => {
          ws.send(JSON.stringify({ type: "FRAME", label: pointId, image: reader.result }));
          resolve();
        };
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.7);
    });
  }, []);

  // ── Capture frames for one point (runs until FRAMES_PER_POINT collected) ──
  const capturePoint = useCallback((pointId) => {
    return new Promise((resolve, reject) => {
      let collected = 0;
      setFrameCount(0);
      setRetryMsg("");

      const ws = wsRef.current;
      let stopped = false;

      const onMessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "FRAME_ACK") {
            if (msg.face_detected) {
              collected++;
              if (isMounted.current) setFrameCount(collected);
              if (collected >= FRAMES_PER_POINT) {
                stopped = true;
                ws.removeEventListener("message", onMessage);
                resolve();
              }
            } else {
              if (isMounted.current)
                setRetryMsg("No face detected — centre your face in the camera.");
            }
          }
          if (msg.type === "ERROR") {
            stopped = true;
            ws.removeEventListener("message", onMessage);
            reject(new Error(msg.detail || "Backend error"));
          }
        } catch (_) {}
      };

      ws.addEventListener("message", onMessage);
      loopStopRef.current = () => { stopped = true; };

      // Async frame loop
      (async () => {
        while (!stopped && collected < FRAMES_PER_POINT) {
          await sendFrame(pointId);
          await new Promise(r => setTimeout(r, 250));
        }
      })();
    });
  }, [sendFrame]);

  // ── Begin calibration (called after user reads intro) ─────────────────────
  const startCalibration = useCallback(async () => {
    await enterFullscreen();
    await new Promise(r => setTimeout(r, 350));

    setPointIdx(0);
    setCompletedIds([]);

    try {
      await openWebSocket();
    } catch {
      setErrorMsg("ML service is not running. Please start the FastAPI server.");
      setPhase(PHASE.ERROR);
      return;
    }

    // Show the first "ready" screen
    setPhase(PHASE.READY);
  }, [enterFullscreen, openWebSocket]);

  // ── Called when user clicks "Capture" on the READY screen ─────────────────
  const handleCapture = useCallback(async () => {
    if (!isMounted.current) return;
    const pt = CALIB_POINTS[pointIdx];
    setPhase(PHASE.CAPTURING);

    let success = false;
    while (!success) {
      try {
        await capturePoint(pt.id);
        success = true;
      } catch {
        if (isMounted.current) {
          setRetryMsg(`Retrying ${pt.label}…`);
          await new Promise(r => setTimeout(r, 800));
        } else return;
      }
    }

    if (!isMounted.current) return;
    setCompletedIds(prev => [...prev, pt.id]);
    setPhase(PHASE.POINT_DONE); // wait for user to click Next
  }, [pointIdx, capturePoint]);

  // ── Called when user clicks "Next" on the POINT_DONE screen ──────────────
  const handleNext = useCallback(async () => {
    const nextIdx = pointIdx + 1;

    if (nextIdx >= CALIB_POINTS.length) {
      // All points done — finalise
      setPhase(PHASE.PROCESSING);

      try {
        const safeZone = await new Promise((resolve, reject) => {
          const ws = wsRef.current;
          const onFinal = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === "CALIBRATION_COMPLETE") {
                ws.removeEventListener("message", onFinal);
                resolve(msg.safe_zone);
              }
              if (msg.type === "ERROR") {
                ws.removeEventListener("message", onFinal);
                reject(new Error(msg.detail));
              }
            } catch (_) {}
          };
          ws.addEventListener("message", onFinal);
          ws.send(JSON.stringify({ type: "FINALIZE" }));
          setTimeout(() => reject(new Error("Calibration timed out.")), 8000);
        });

        if (!isMounted.current) return;
        setPhase(PHASE.DONE);
        stopCamera();
        wsRef.current?.close();
        if (document.fullscreenElement) await document.exitFullscreen();

        setTimeout(() => {
          navigate("/exam", { state: { examCode, calibrationData: safeZone } });
        }, 1000);

      } catch (err) {
        if (isMounted.current) {
          setErrorMsg(err.message || "Finalisation failed. Please retry.");
          setPhase(PHASE.ERROR);
        }
      }
    } else {
      setPointIdx(nextIdx);
      setPhase(PHASE.READY);
    }
  }, [pointIdx, stopCamera, navigate, examCode]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true;
    startCamera();
    return () => {
      isMounted.current = false;
      loopStopRef.current?.();
      wsRef.current?.close();
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // ── Derived values ────────────────────────────────────────────────────────
  const currentPoint = CALIB_POINTS[pointIdx];
  const progress     = Math.min(Math.round((frameCount / FRAMES_PER_POINT) * 100), 100);
  const showDots     = [PHASE.READY, PHASE.CAPTURING, PHASE.POINT_DONE].includes(phase);

  // For the center dot, move the instruction card to the bottom so it
  // doesn't overlap the dot. For all other points, keep it centered.
  const isCenterPoint = currentPoint?.id === "CENTER";
  const cardPosition  = isCenterPoint
    ? "absolute bottom-8 left-1/2 -translate-x-1/2"
    : "absolute inset-0 flex items-center justify-center";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative bg-gray-950 overflow-hidden select-none"
      style={{ width: "100vw", height: "100vh" }}
    >
      {/* Hidden camera feed — needed for frame capture, not shown to user */}
      <video ref={videoRef} className="hidden" muted playsInline />

      {/* ── Calibration dots ── */}
      {showDots && CALIB_POINTS.map((pt, i) => {
        const isDone    = completedIds.includes(pt.id);
        const isCurrent = i === pointIdx && phase === PHASE.CAPTURING;
        const isReady   = i === pointIdx && phase === PHASE.READY;

        return (
          <div key={pt.id} className="absolute" style={pt.style}>
            {/* Pulse ring — shown when ready or actively capturing */}
            {(isCurrent || isReady) && (
              <span
                className="absolute rounded-full animate-ping bg-indigo-400 opacity-75"
                style={{ width: 56, height: 56, top: -16, left: -16 }}
              />
            )}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300
                ${isDone
                  ? "bg-green-400 scale-110"
                  : (isCurrent || isReady)
                    ? "bg-indigo-400 scale-150 shadow-[0_0_20px_8px_rgba(99,102,241,0.9)]"
                    : "bg-gray-600 opacity-25"}`}
            >
              {isDone && <CheckCircleIcon className="w-4 h-4 text-white" />}
            </div>
          </div>
        );
      })}

      {/* ── Instruction / status card ── */}

      {/* RULES SCREEN — full centre card */}
      {phase === PHASE.RULES && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-gray-900 bg-opacity-98 border border-gray-700 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <ShieldExclamationIcon className="w-8 h-8 text-red-400 flex-shrink-0" />
              <h1 className="text-2xl font-bold text-white">Exam Rules</h1>
            </div>

            <p className="text-gray-400 text-sm mb-5">
              Please read and understand the following rules before proceeding.
              Violations are recorded automatically.
            </p>

            <ul className="space-y-3 mb-6">
              {RULES.map(({ icon: Icon, color, text }, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${color}`} />
                  <span className="text-gray-300 text-sm">{text}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => setPhase(PHASE.INTRO)}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition text-lg"
            >
              I Understand — Continue
            </button>
          </div>
        </div>
      )}

      {/* INTRO — calibration instructions */}
      {phase === PHASE.INTRO && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-gray-900 bg-opacity-98 border border-gray-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl text-center">
            <h1 className="text-2xl font-bold text-white mb-2">Gaze Calibration</h1>
            <p className="text-gray-400 text-sm mb-5">
              We will show you{" "}
              <span className="text-indigo-400 font-semibold">5 dots</span> — one at each
              corner and the center. For each dot:
            </p>
            <ol className="text-gray-400 text-sm text-left space-y-2 mb-6 px-2 list-decimal list-inside">
              <li>Look directly at the glowing dot.</li>
              <li>Click <strong className="text-white">Capture</strong> when you're ready.</li>
              <li>Hold your gaze steady while frames are collected.</li>
              <li>Click <strong className="text-white">Next</strong> to move to the next dot.</li>
            </ol>
            <ul className="text-gray-500 text-xs text-left space-y-1 mb-6 px-2">
              <li>✦ Keep your head still — move only your eyes</li>
              <li>✦ Good lighting improves accuracy</li>
              <li>✦ Sit at your normal exam distance from the screen</li>
            </ul>
            {!cameraReady ? (
              <p className="text-yellow-400 text-sm animate-pulse">Starting camera…</p>
            ) : (
              <button
                onClick={startCalibration}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition text-lg"
              >
                Start Calibration
              </button>
            )}
            <p className="text-gray-600 text-xs mt-3">
              Will enter fullscreen automatically.
            </p>
          </div>
        </div>
      )}

      {/* READY — tell user to look at dot, then click Capture */}
      {phase === PHASE.READY && (
        <div className={`${cardPosition} pointer-events-none z-10`}>
          <div className="pointer-events-auto bg-gray-900 bg-opacity-95 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl text-center">
            <p className="text-indigo-400 text-xs font-semibold uppercase tracking-widest mb-1">
              Point {pointIdx + 1} of {CALIB_POINTS.length}
            </p>
            <h2 className="text-lg font-bold text-white mb-1">
              Look at the{" "}
              <span className="text-indigo-400">{currentPoint?.label}</span>
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Fix your eyes on the glowing dot, then click Capture.
            </p>
            <button
              onClick={handleCapture}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
            >
              Capture
            </button>
          </div>
        </div>
      )}

      {/* CAPTURING — progress bar, no button */}
      {phase === PHASE.CAPTURING && (
        <div className={`${cardPosition} pointer-events-none z-10`}>
          <div className="pointer-events-auto bg-gray-900 bg-opacity-95 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl text-center">
            <p className="text-indigo-400 text-xs font-semibold uppercase tracking-widest mb-1">
              Capturing…
            </p>
            <h2 className="text-lg font-bold text-white mb-3">
              Keep looking at the{" "}
              <span className="text-indigo-400">{currentPoint?.label}</span>
            </h2>
            <div className="w-full bg-gray-800 rounded-full h-3 mb-2">
              <div
                className="bg-indigo-500 h-3 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-gray-500 text-xs">
              {frameCount} / {FRAMES_PER_POINT} frames captured
            </p>
            {retryMsg && (
              <p className="text-yellow-400 text-xs mt-3 animate-pulse">{retryMsg}</p>
            )}
          </div>
        </div>
      )}

      {/* POINT DONE — show tick and Next button */}
      {phase === PHASE.POINT_DONE && (
        <div className={`${cardPosition} pointer-events-none z-10`}>
          <div className="pointer-events-auto bg-gray-900 bg-opacity-95 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl text-center">
            <CheckCircleIcon className="w-12 h-12 text-green-400 mx-auto mb-2" />
            <h2 className="text-lg font-bold text-green-400 mb-1">
              {currentPoint?.label} captured!
            </h2>
            {pointIdx < CALIB_POINTS.length - 1 ? (
              <>
                <p className="text-gray-400 text-sm mb-4">
                  Next: <span className="text-white font-semibold">{CALIB_POINTS[pointIdx + 1]?.label}</span>
                </p>
                <button
                  onClick={handleNext}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
                >
                  Next Point →
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-sm mb-4">All points captured!</p>
                <button
                  onClick={handleNext}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition"
                >
                  Finish Calibration ✓
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* PROCESSING */}
      {phase === PHASE.PROCESSING && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-gray-900 bg-opacity-95 border border-gray-700 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white">Computing boundaries…</h2>
            <p className="text-gray-400 text-sm mt-2">Building your personalised gaze zone.</p>
          </div>
        </div>
      )}

      {/* DONE */}
      {phase === PHASE.DONE && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-gray-900 bg-opacity-95 border border-gray-700 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
            <CheckCircleIcon className="w-14 h-14 text-green-400 mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-green-400">Calibration Complete!</h2>
            <p className="text-gray-400 text-sm mt-2">Starting your exam…</p>
          </div>
        </div>
      )}

      {/* ERROR */}
      {phase === PHASE.ERROR && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-gray-900 bg-opacity-95 border border-gray-700 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
            <ExclamationTriangleIcon className="w-14 h-14 text-red-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-red-400">Calibration Failed</h2>
            <p className="text-gray-400 text-sm mt-2 mb-4">{errorMsg}</p>
            <button
              onClick={() => { setPhase(PHASE.RULES); setErrorMsg(""); }}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Progress indicator — visible during calibration phases */}
      {showDots && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {CALIB_POINTS.map((pt, i) => (
            <div
              key={pt.id}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                completedIds.includes(pt.id)
                  ? "bg-green-400"
                  : i === pointIdx
                    ? "bg-indigo-400 scale-125"
                    : "bg-gray-600"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}