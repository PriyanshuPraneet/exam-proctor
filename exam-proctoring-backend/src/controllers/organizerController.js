import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";
import ProctorLog from "../models/ProctorLog.js";

/* =========================
   ORGANIZER DASHBOARD
========================= */
export const getOrganizerDashboard = async (req, res) => {
  try {
    const organizerId = req.user._id;

    const exams = await Exam.find({ createdBy: organizerId }).sort({
      createdAt: -1,
    });

    let totalSubmissions = 0;
    let totalScore = 0;

    const recentExams = await Promise.all(
      exams.slice(0, 5).map(async (exam) => {
        const submissions = await Submission.find({
          examId: exam._id,
          submittedAt: { $ne: null },
        });

        submissions.forEach((s) => {
          totalScore += s.score || 0;
        });

        totalSubmissions += submissions.length;

        return {
          _id: exam._id,
          title: exam.title,
          examCode: exam.examCode,
          startTime: exam.startTime,
          endTime: exam.endTime,
        };
      })
    );

    const averageScore =
      totalSubmissions > 0
        ? (totalScore / totalSubmissions).toFixed(2)
        : 0;

    res.json({
      totalExams: exams.length,
      totalCandidates: totalSubmissions,
      totalSubmissions,
      averageScore,
      recentExams,
    });
  } catch (error) {
    console.error("❌ Organizer dashboard error:", error);
    res.status(500).json({
      message: "Server error while loading organizer dashboard",
    });
  }
};

/* =========================
   ORGANIZER EXAMS LIST
========================= */
export const getOrganizerExams = async (req, res) => {
  try {
    const exams = await Exam.find({
      createdBy: req.user._id,
    }).sort({ createdAt: -1 });

    res.json(exams);
  } catch (error) {
    console.error("❌ Failed to fetch organizer exams:", error);
    res.status(500).json({ message: "Failed to fetch exams" });
  }
};

/* =========================
   ORGANIZER VIEW EXAM
========================= */
export const getOrganizerExam = async (req, res) => {
  try {
    const { examId } = req.params;

    const exam = await Exam.findById(examId).populate("questions");

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Forbidden." });
    }

    res.json(exam);
  } catch (error) {
    console.error("❌ Error fetching organizer exam:", error);
    res.status(500).json({
      message: "Server error while fetching exam.",
    });
  }
};

/* =========================
   🆕 ORGANIZER: PROCTOR LOGS
========================= */
export const getExamProctorLogs = async (req, res) => {
  try {
    const { examId } = req.params;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    // 🔒 Ownership check
    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const logs = await ProctorLog.find({ examId })
      .populate("userId", "name email")
      .sort({ "events.timestamp": 1 });

    const formatted = logs.map(log => ({
      candidate: {
        _id: log.userId._id,
        name: log.userId.name,
        email: log.userId.email,
      },
      strikes: log.events.length,
      events: log.events,
    }));

    res.json(formatted);
  } catch (error) {
    console.error("❌ Proctor logs error:", error);
    res.status(500).json({ message: "Server error." });
  }
};
