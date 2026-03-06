import ProctorLog from "../models/ProctorLog.js";

/* =========================
   STRIKE-WORTHY VIOLATION TYPES
   Only these event types count toward the 3-strike limit.
   Everything else is logged for the organizer but does NOT
   increment the strike counter shown to the frontend.
========================= */
const STRIKE_TYPES = new Set([
  "EXIT_FULLSCREEN",
  "TAB_SWITCH",
  "WINDOW_BLUR",
  "SCREEN_SHARE_STOPPED",
  "PHONE_DETECTED",
  "MULTIPLE_PERSONS",
  // GAZE_STRIKE removed — gaze is warning only, not a strike
]);

/* =========================
   CANDIDATE: LOG VIOLATION
========================= */
export const logViolation = async (req, res) => {
  try {
    const { examId, type } = req.body;
    const userId = req.user._id;

    if (!examId || !type) {
      return res.status(400).json({
        message: "examId and violation type are required",
      });
    }

    let log = await ProctorLog.findOne({ examId, userId });

    if (!log) {
      log = new ProctorLog({
        examId,
        userId,
        events: [],
      });
    }

    // Always log the event (organizer can see full history)
    log.events.push({
      type,
      timestamp: new Date(),
    });

    await log.save();

    // Only count events that are in the STRIKE_TYPES set
    const strikes = log.events.filter(e => STRIKE_TYPES.has(e.type)).length;

    return res.json({
      message: "Violation logged",
      strikes,             // ← Frontend uses this to trigger auto-submit at 3
      lastEvent: type,
      isStrike: STRIKE_TYPES.has(type),
    });
  } catch (error) {
    console.error("Proctor log error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   ORGANIZER: GET LOGS BY EXAM
========================= */
export const getProctorLogsByExam = async (req, res) => {
  try {
    const { examId } = req.params;

    const logs = await ProctorLog.find({ examId })
      .populate("userId", "name email")
      .sort({ createdAt: 1 });

    res.json(logs);
  } catch (error) {
    console.error("Fetch proctor logs error:", error);
    res.status(500).json({
      message: "Failed to fetch proctor logs",
    });
  }
};