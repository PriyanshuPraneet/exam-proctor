import mongoose from "mongoose";

const examSchema = new mongoose.Schema({
  /* =========================
     BASIC INFO
  ========================= */
  title: { type: String, required: true },
  description: String,

  /* =========================
     OWNERSHIP
  ========================= */
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  /* =========================
     SCHEDULING
  ========================= */
  startTime: Date,
  endTime: Date,
  duration: Number, // minutes

  /* =========================
     QUESTIONS
  ========================= */
  questions: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
  ],

  /* =========================
     ACCESS CONTROL
  ========================= */

  // 🔑 Exam join code (manual entry)
  examCode: {
    type: String,
    unique: true,
    required: true,
  },

  // 👥 Assigned candidates (optional)
  // Candidates added by organizer (email → userId)
  assignedCandidates: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],

  /* =========================
     METADATA
  ========================= */
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Exam", examSchema);
