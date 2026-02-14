// controllers/proctorController.js
import ProctorLog from "../models/ProctorLog.js";

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

    log.events.push({
      type,
      timestamp: new Date(),
    });

    await log.save();

    return res.json({
      message: "Violation logged",
      strikes: log.events.length,
      lastEvent: type,
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
