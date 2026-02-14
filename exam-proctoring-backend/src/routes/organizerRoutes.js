import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getOrganizerDashboard,
  getOrganizerExams,
  getOrganizerExam,
  getExamProctorLogs,
} from "../controllers/organizerController.js";
import { getExamResults } from "../controllers/resultController.js";

const router = express.Router();

// Dashboard summary
router.get("/dashboard", authMiddleware, getOrganizerDashboard);

// Exams management list
router.get("/exams", authMiddleware, getOrganizerExams);

// View question paper
router.get("/exams/:examId", authMiddleware, getOrganizerExam);

// View results
router.get("/exams/:examId/results", authMiddleware, getExamResults);

// 🆕 View proctoring / violation logs
router.get(
  "/exams/:examId/proctor-logs",
  authMiddleware,
  getExamProctorLogs
);

export default router;
