// backend/controllers/candidateController.js

import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";

/* =========================
   CANDIDATE DASHBOARD
========================= */
export const getCandidateDashboard = async (req, res) => {
  try {
    const candidateId = req.user._id;
    const now = new Date();

    /* -------------------------
       Past Submissions
    ------------------------- */
    const pastSubmissions = await Submission.find({
      candidateId,
      submittedAt: { $ne: null },
    })
      .populate("examId", "title startTime endTime")
      .sort({ submittedAt: -1 });

    /* -------------------------
       Exams already attempted
    ------------------------- */
    const attemptedExamIds = pastSubmissions.map(
      (s) => s.examId?._id
    );

    /* -------------------------
       Upcoming Exams
    ------------------------- */
    const upcomingExams = await Exam.find({
      _id: { $nin: attemptedExamIds },
      startTime: { $gte: now },
    }).select("title startTime endTime duration examCode");

    res.json({
      upcomingExams,
      pastSubmissions,
    });
  } catch (error) {
    console.error("❌ Candidate dashboard error:", error);
    res.status(500).json({
      message: "Failed to load candidate dashboard data.",
    });
  }
};
