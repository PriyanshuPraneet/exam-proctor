import express from "express";
import { getExamResults } from "../controllers/resultController.js";
import { authMiddleware as protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/exam/:examId", protect, getExamResults); // organizer only

export default router;
