import express from "express";
import {
  submitExam,
  getMySubmissions,
  getSubmissionsByExam
} from "../controllers/submissionController.js";
import { authMiddleware as protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =========================
   CANDIDATE ROUTES
========================= */

// Submit exam (only after startExam)
router.post("/", protect, submitExam);

// Get candidate's own submissions
router.get("/my", protect, getMySubmissions);

/* =========================
   ORGANIZER ROUTES
========================= */

// Get all submissions for a specific exam
router.get("/exam/:examId", protect, getSubmissionsByExam);

export default router;
