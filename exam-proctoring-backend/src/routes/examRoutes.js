import express from "express";
import {
  createExam,
  getMyExams,
  getExamById,
  startExam,
  joinExam,
  addCandidatesToExam,
  getCandidateUpcomingExams,
} from "../controllers/examController.js";
import { authMiddleware as protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =========================
   ORGANIZER ROUTES
========================= */

// Create a new exam
router.post("/", protect, createExam);

// Get exams created by organizer
router.get("/my", protect, getMyExams);

// Add candidates AFTER exam creation
router.post(
  "/:examId/candidates",
  protect,
  addCandidatesToExam
);

/* =========================
   CANDIDATE ROUTES
========================= */

// ✅ MUST come BEFORE "/:id"
router.get(
  "/upcoming",
  protect,
  getCandidateUpcomingExams
);

// Join exam (Dashboard visibility)
router.post("/join", protect, joinExam);

// Start / Resume exam (Actual exam attempt)
router.post("/start", protect, startExam);

/* =========================
   ORGANIZER ONLY (KEEP LAST)
========================= */

// ❗ MUST be LAST to avoid route collision
router.get("/:id", protect, getExamById);

export default router;
