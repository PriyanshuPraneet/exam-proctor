import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
  type: { type: String, enum: ["mcq", "text"], required: true },
  questionText: { type: String, required: true },
  options: [String], // only for MCQ
  correctAnswer: String
});

export default mongoose.model("Question", questionSchema);
