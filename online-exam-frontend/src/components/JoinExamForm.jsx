import React, { useState } from 'react';
import axios from 'axios';
import { Loader2, ArrowRight } from 'lucide-react';

const API_BASE_URL = "http://localhost:5000/api/exams";

export default function JoinExamForm() {
  const [examCode, setExamCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    const token = localStorage.getItem('authToken');
    if (!token) {
      setMessage({
        type: 'error',
        text: 'You must be logged in to join an exam.',
      });
      setLoading(false);
      return;
    }

    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/join`,
        { examCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // ✅ Backend returns: { message, exam }
      setMessage({
        type: 'success',
        text: `Joined "${data.exam.title}". You can start the exam from your dashboard.`,
      });

      setExamCode('');

    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error.response?.data?.message ||
          'Invalid exam code or exam already closed.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-xl shadow-lg max-w-md mx-auto my-10">
      <h2 className="text-2xl font-bold mb-2">Join an Exam</h2>
      <p className="text-gray-600 mb-6">
        Enter the 6-character exam code provided by your organizer.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">
            Exam Code
          </label>
          <input
            type="text"
            maxLength="6"
            required
            value={examCode}
            onChange={(e) => setExamCode(e.target.value.toUpperCase())}
            placeholder="E.g., A1B2C3"
            disabled={loading}
            className="w-full py-3 px-4 border border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-widest"
          />
        </div>

        {message && (
          <div
            className={`p-3 rounded ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || examCode.length !== 6}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Joining…
            </>
          ) : (
            <>
              Join Exam <ArrowRight size={20} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
