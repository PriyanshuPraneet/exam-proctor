import Submission from "../models/Submission.js";
import Exam from "../models/Exam.js";

/* =========================
   SUBMIT EXAM (CANDIDATE)
========================= */
export const submitExam = async (req, res) => {
  try {
    const { examId, answers } = req.body;
    const candidateId = req.user._id;
    const now = new Date();

    if (!examId || !Array.isArray(answers)) {
      return res.status(400).json({ message: "Invalid submission payload." });
    }

    const exam = await Exam.findById(examId).populate("questions");
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    /* =========================
       TIME WINDOW CHECK
    ========================= */
    if (exam.startTime && now < new Date(exam.startTime)) {
      return res.status(403).json({ message: "Exam has not started yet." });
    }
    if (exam.endTime && now > new Date(exam.endTime)) {
      return res.status(403).json({ message: "Exam has ended." });
    }

    /* =========================
       VERIFY STARTED EXAM
    ========================= */
    const submission = await Submission.findOne({ examId, candidateId });
    if (!submission) {
      return res
        .status(403)
        .json({ message: "Exam not started. Please start the exam first." });
    }

    if (submission.submittedAt || submission.isSubmitted) {
      return res.status(403).json({ message: "Exam already submitted." });
    }

    /* =========================
       AUTO-SCORING (MCQ)
    ========================= */
    let score = 0;

    // Map questionId -> question
    const questionMap = new Map();
    exam.questions.forEach(q => {
      questionMap.set(q._id.toString(), q);
    });

    answers.forEach(ans => {
      const question = questionMap.get(ans.questionId);
      if (!question) return;

      if (question.type === "mcq") {
        const correctIndex = question.correctAnswer; // "0" | "1" | ...
        const correctOption = question.options[Number(correctIndex)];

        if (
          correctOption !== undefined &&
          ans.answer.trim() === correctOption.trim()
        ) {
          score += 1;
        }
      }
    });

    /* =========================
       SAVE SUBMISSION
    ========================= */
    submission.answers = answers;
    submission.score = score;
    submission.submittedAt = now;
    submission.isSubmitted = true; // ✅ FIX (CRITICAL)

    await submission.save();

    res.status(201).json({
      message: "Exam submitted successfully.",
      score,
    });
  } catch (error) {
    console.error("Submit exam error:", error);
    res.status(500).json({ message: "Server error during submission." });
  }
};

/* =========================
   CANDIDATE: MY SUBMISSIONS
========================= */
export const getMySubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find({
      candidateId: req.user._id,
    }).populate("examId", "title startTime endTime");

    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
};

/* =========================
   ORGANIZER: EXAM SUBMISSIONS
========================= */
export const getSubmissionsByExam = async (req, res) => {
  try {
    const { examId } = req.params;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const submissions = await Submission.find({ examId })
      .populate("candidateId", "name email")
      .populate("answers.questionId", "questionText type options");

    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
};
