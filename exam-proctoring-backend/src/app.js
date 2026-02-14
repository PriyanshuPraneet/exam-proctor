import express from "express";
import cors from "cors";
import morgan from "morgan";

import authRoutes from "./routes/authRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import submissionRoutes from "./routes/submissionRoutes.js";
import organizerRoutes from "./routes/organizerRoutes.js";
import resultRoutes from "./routes/resultRoutes.js";
import candidateRoutes from "./routes/candidateRoutes.js"; // ✅ NEW
import proctorRoutes from "./routes/proctorRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

/* =========================
   ROUTES
========================= */
app.use("/api/auth", authRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/organizer", organizerRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/candidate", candidateRoutes); // ✅ FIX
app.use("/api/proctor", proctorRoutes);

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({ message: "API is running 🚀" });
});

export default app;
