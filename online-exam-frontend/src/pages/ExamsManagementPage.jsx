import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeftIcon,
  EyeIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

const API_BASE_URL = "http://localhost:5000/api";

const ExamsManagementPage = () => {
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* =========================
     FETCH ORGANIZER EXAMS
  ========================= */
  useEffect(() => {
    const fetchExams = async () => {
      const token = localStorage.getItem("authToken");
      if (!token) {
        navigate("/login");
        return;
      }

      try {
        const response = await axios.get(
          `${API_BASE_URL}/organizer/exams`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        console.log("📦 Exams API response:", response.data);

        // ✅ SUPPORT BOTH SHAPES
        if (Array.isArray(response.data)) {
          setExams(response.data);
        } else if (Array.isArray(response.data.exams)) {
          setExams(response.data.exams);
        } else {
          setExams([]);
        }
      } catch (err) {
        console.error("❌ Fetch exams error:", err);
        setError(
          err.response?.data?.message ||
            "Failed to load exams from server."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchExams();
  }, [navigate]);

  /* =========================
     UI STATES
  ========================= */
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-blue-600 text-lg">
        Loading Exams…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-lg mx-auto mt-20 bg-red-100 rounded text-center">
        <p className="mb-4 text-red-700">{error}</p>
        <button
          onClick={() => navigate("/dashboard")}
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center bg-white p-6 rounded shadow">
          <h1 className="text-2xl font-bold text-gray-800">
            Exams Management
          </h1>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center text-blue-600 hover:text-blue-800"
          >
            <ArrowLeftIcon className="w-5 h-5 mr-1" />
            Back
          </button>
        </div>

        {/* Exams Table */}
        <div className="bg-white p-6 rounded shadow overflow-x-auto">
          {exams.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Title
                  </th>
                  <th className="px-6 py-3">Exam Code</th>
                  <th className="px-6 py-3">Start Time</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {exams.map((exam) => {
                  const isCompleted =
                    exam.endTime &&
                    new Date(exam.endTime) < new Date();

                  return (
                    <tr key={exam._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium">
                        {exam.title}
                      </td>

                      <td className="px-6 py-4 font-mono">
                        {exam.examCode}
                      </td>

                      <td className="px-6 py-4">
                        {exam.startTime
                          ? new Date(exam.startTime).toLocaleString()
                          : "—"}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            isCompleted
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {isCompleted ? "Completed" : "Active"}
                        </span>
                      </td>

                      <td className="px-6 py-4 space-x-4">
                        <button
                          onClick={() =>
                            navigate(`/organizer/exams/${exam._id}`)
                          }
                          className="inline-flex items-center text-blue-600 hover:text-blue-800"
                        >
                          <EyeIcon className="w-4 h-4 mr-1" />
                          View Paper
                        </button>

                        <button
                          onClick={() =>
                            navigate(
                              `/organizer/exams/${exam._id}/results`
                            )
                          }
                          className="inline-flex items-center text-green-600 hover:text-green-800"
                        >
                          <ChartBarIcon className="w-4 h-4 mr-1" />
                          View Results
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-center text-gray-500 py-6">
              No exams found for this organizer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamsManagementPage;
