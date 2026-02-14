// controllers/organizerController.js
import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";

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
    const exams = await Exam.find({ createdBy: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch exams" });
  }
};
