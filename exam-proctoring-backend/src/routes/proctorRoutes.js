// routes/proctorRoutes.js
import express from "express";
import {
  logViolation,
  getProctorLogsByExam,
} from "../controllers/proctorController.js";
import { authMiddleware as protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =========================
   CANDIDATE
========================= */
router.post("/log", protect, logViolation);

/* =========================
   ORGANIZER
========================= */
router.get("/exam/:examId", protect, getProctorLogsByExam);

export default router;
