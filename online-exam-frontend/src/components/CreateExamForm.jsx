import React, { useState } from 'react';
import axios from 'axios';
import { Plus, Trash2, Loader2, Save, X } from 'lucide-react';

const API_BASE_URL = "http://localhost:5000/api/exams";

/* =========================
   SAFE ID GENERATOR
========================= */
const generateId = () =>
  window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

/* =========================
   HELPERS
========================= */
const createQuestion = () => ({
  id: generateId(),
  type: 'mcq',
  questionText: '',
  options: ['', '', '', ''],
  correctAnswer: '',
});

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/* =========================
   QUESTION CARD
========================= */
const QuestionCard = ({
  question,
  index,
  onRemove,
  onQuestionChange,
  onOptionChange,
  disableRemove,
}) => {
  const formatName = `correct-${question.id}`;

  return (
    <div className="p-4 border rounded-lg bg-white space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Question {index + 1}</h3>
        <button
          type="button"
          onClick={() => onRemove(question.id)}
          disabled={disableRemove}
          className="text-red-400 hover:text-red-600 disabled:opacity-30"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <select
        value={question.type}
        onChange={(e) => onQuestionChange(question.id, 'type', e.target.value)}
        className="border p-2 rounded w-full"
      >
        <option value="mcq">MCQ</option>
        <option value="text">Text</option>
      </select>

      <textarea
        value={question.questionText}
        onChange={(e) => onQuestionChange(question.id, 'questionText', e.target.value)}
        placeholder="Question text"
        className="border p-2 rounded w-full"
      />

      {question.type === 'mcq' && (
        <div className="space-y-2">
          {question.options.map((opt, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="radio"
                name={formatName}
                checked={question.correctAnswer === String(i)}
                onChange={() => onQuestionChange(question.id, 'correctAnswer', String(i))}
              />
              <input
                type="text"
                value={opt}
                onChange={(e) => onOptionChange(question.id, i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="border p-2 rounded w-full"
              />
            </div>
          ))}
        </div>
      )}

      {question.type === 'text' && (
        <input
          type="text"
          value={question.correctAnswer}
          onChange={(e) => onQuestionChange(question.id, 'correctAnswer', e.target.value)}
          placeholder="Correct answer"
          className="border p-2 rounded w-full"
        />
      )}
    </div>
  );
};

/* =========================
   MAIN COMPONENT
========================= */
export default function CreateExamForm() {
  const [exam, setExam] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    duration: 60,
    candidateEmails: [],
    questions: [createQuestion()],
  });

  const [emailInput,  setEmailInput]  = useState('');
  const [emailError,  setEmailError]  = useState('');
  const [loading,     setLoading]     = useState(false);
  const [message,     setMessage]     = useState(null);

  const handleExamChange = (e) => {
    const { name, value } = e.target;
    setExam(prev => ({ ...prev, [name]: value }));
  };

  /* =========================
     CANDIDATE EMAILS
  ========================= */
  const addCandidateEmail = () => {
    const email = emailInput.trim().toLowerCase();
    setEmailError('');

    if (!email) return;

    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    if (exam.candidateEmails.includes(email)) {
      setEmailError('This email has already been added.');
      return;
    }

    setExam(prev => ({
      ...prev,
      candidateEmails: [...prev.candidateEmails, email],
    }));
    setEmailInput('');
  };

  // ✅ FIX: Enter key in the email field adds the email instead of submitting the form
  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // stops form submission
      addCandidateEmail();
    }
  };

  const removeCandidateEmail = (email) => {
    setExam(prev => ({
      ...prev,
      candidateEmails: prev.candidateEmails.filter(e => e !== email),
    }));
  };

  /* =========================
     QUESTIONS
  ========================= */
  const handleAddQuestion = () => {
    setExam(prev => ({
      ...prev,
      questions: [...prev.questions, createQuestion()],
    }));
  };

  const handleRemoveQuestion = (id) => {
    setExam(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== id),
    }));
  };

  const handleQuestionChange = (id, field, value) => {
    setExam(prev => ({
      ...prev,
      questions: prev.questions.map(q =>
        q.id === id ? { ...q, [field]: value } : q
      ),
    }));
  };

  const handleOptionChange = (qId, index, value) => {
    setExam(prev => ({
      ...prev,
      questions: prev.questions.map(q =>
        q.id === qId
          ? { ...q, options: q.options.map((o, i) => (i === index ? value : o)) }
          : q
      ),
    }));
  };

  /* =========================
     SUBMIT
  ========================= */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    // If the organiser typed an email but forgot to press Add, include it automatically
    if (emailInput.trim()) {
      const pendingEmail = emailInput.trim().toLowerCase();
      if (isValidEmail(pendingEmail) && !exam.candidateEmails.includes(pendingEmail)) {
        exam.candidateEmails = [...exam.candidateEmails, pendingEmail];
        setEmailInput('');
      }
    }

    try {
      const token = localStorage.getItem('authToken');
      if (!token) throw new Error("Auth token missing");

      const payload = {
        ...exam,
        duration: Number(exam.duration),
        questions: exam.questions.map(({ id, ...q }) => q),
      };

      const { data } = await axios.post(API_BASE_URL, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setMessage({
        type: 'success',
        text: `Exam created! Code: ${data.examCode}${
          exam.candidateEmails.length > 0
            ? ` · ${exam.candidateEmails.length} candidate(s) assigned.`
            : ''
        }`,
      });

      setExam({
        title: '',
        description: '',
        startTime: '',
        endTime: '',
        duration: 60,
        candidateEmails: [],
        questions: [createQuestion()],
      });
      setEmailInput('');
      setEmailError('');

    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to create exam',
      });
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="p-8 max-w-4xl mx-auto bg-white rounded-xl shadow">
      <h1 className="text-3xl font-bold mb-6">Create Exam</h1>

      {message && (
        <div className={`p-3 mb-4 rounded ${
          message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        <input
          name="title"
          value={exam.title}
          onChange={handleExamChange}
          placeholder="Exam Title"
          required
          className="border p-2 rounded w-full"
        />

        <textarea
          name="description"
          value={exam.description}
          onChange={handleExamChange}
          placeholder="Description"
          className="border p-2 rounded w-full"
        />

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Start Time</label>
            <input
              type="datetime-local"
              name="startTime"
              value={exam.startTime}
              onChange={handleExamChange}
              className="border p-2 rounded w-full"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">End Time</label>
            <input
              type="datetime-local"
              name="endTime"
              value={exam.endTime}
              onChange={handleExamChange}
              className="border p-2 rounded w-full"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Duration (minutes)</label>
            <input
              type="number"
              name="duration"
              value={exam.duration}
              onChange={handleExamChange}
              min={1}
              className="border p-2 rounded w-full"
            />
          </div>
        </div>

        {/* ── Assign Candidates ── */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Assign Candidates</h2>
          <p className="text-xs text-gray-400 mb-3">
            Add candidate emails. Press <kbd className="bg-gray-100 px-1 rounded">Enter</kbd> or
            click <strong>Add</strong> after each one.
          </p>

          <div className="flex gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); setEmailError(''); }}
              onKeyDown={handleEmailKeyDown}   // ✅ Enter adds email, not submit
              placeholder="candidate@email.com"
              className={`border p-2 rounded w-full ${emailError ? 'border-red-400' : ''}`}
            />
            <button
              type="button"                    // ✅ never submits the form
              onClick={addCandidateEmail}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded transition"
            >
              Add
            </button>
          </div>

          {emailError && (
            <p className="text-red-500 text-xs mt-1">{emailError}</p>
          )}

          {exam.candidateEmails.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {exam.candidateEmails.map(email => (
                <span
                  key={email}
                  className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                >
                  {email}
                  <X
                    size={14}
                    className="cursor-pointer text-blue-400 hover:text-red-500"
                    onClick={() => removeCandidateEmail(email)}
                  />
                </span>
              ))}
            </div>
          )}

          {exam.candidateEmails.length === 0 && (
            <p className="text-xs text-gray-400 mt-2">
              No candidates added yet. Leave empty to allow anyone with the code to join.
            </p>
          )}
        </div>

        {/* ── Questions ── */}
        <h2 className="text-xl font-semibold">Questions</h2>

        {exam.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            onRemove={handleRemoveQuestion}
            onQuestionChange={handleQuestionChange}
            onOptionChange={handleOptionChange}
            disableRemove={exam.questions.length === 1}
          />
        ))}

        <button
          type="button"
          onClick={handleAddQuestion}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded flex gap-2 transition"
        >
          <Plus size={18} /> Add Question
        </button>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded flex justify-center gap-2 transition disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Save />}
          Save Exam
        </button>

      </form>
    </div>
  );
}