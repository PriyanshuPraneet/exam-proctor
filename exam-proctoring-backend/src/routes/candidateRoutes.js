// backend/routes/candidateRoutes.js

import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { getCandidateDashboard } from "../controllers/candidateController.js";

const router = express.Router();

/* =========================
   CANDIDATE DASHBOARD
========================= */
router.get("/dashboard", authMiddleware, getCandidateDashboard);

export default router;
