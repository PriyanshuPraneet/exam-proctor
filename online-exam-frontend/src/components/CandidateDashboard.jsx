// src/components/CandidateDashboard.jsx
import React from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  ClockIcon,
  CheckCircleIcon,
  PlayIcon,
  PencilSquareIcon,
  CalendarIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

const API_BASE_URL = 'http://localhost:5000/api/exams';

const ExamCard = ({ exam, type }) => {
  const navigate = useNavigate();
  const isUpcoming = type === 'upcoming';

  const formatDate = (date) =>
    new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const formatTime = (date) =>
    new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleStartExam = async () => {
    if (!isUpcoming) return;
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        navigate('/login');
        return;
      }

      await axios.post(
        `${API_BASE_URL}/start`,
        { examCode: exam.examCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      navigate('/exam', { state: { examCode: exam.examCode } });
    } catch (err) {
      alert(err.response?.data?.message || 'Unable to start exam at this time.');
    }
  };

  // --- CLASSIC PAST RESULTS CARD ---
  if (!isUpcoming) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-sm transition-shadow">
        <div className="flex justify-between items-start mb-4">
          <div className="p-2 bg-gray-50 rounded-lg">
            <AcademicCapIcon className="w-6 h-6 text-gray-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-gray-100 text-gray-600 rounded">
            Completed
          </span>
        </div>

        <h4 className="text-lg font-bold text-gray-900 mb-1 truncate">
          {exam.title || 'Assessment'}
        </h4>
        <p className="text-xs text-gray-500 flex items-center mb-4">
          <CalendarIcon className="w-3 h-3 mr-1" />
          Finished on {formatDate(exam.submittedAt || exam.startTime)}
        </p>

        <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-4 mt-2">
          <div>
            <span className="block text-[10px] text-gray-400 uppercase font-bold tracking-tight">Score</span>
            <span className="text-lg font-bold text-blue-600">
              {exam.score !== undefined ? `${exam.score}%` : 'Graded'}
            </span>
          </div>
          <div className="text-right">
            <button 
              className="mt-2 text-xs font-semibold text-gray-600 hover:text-blue-600 flex items-center justify-end ml-auto"
              onClick={() => {/* Navigate to results detail */}}
            >
              <PencilSquareIcon className="w-4 h-4 mr-1" />
              Details
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- STANDARD UPCOMING EXAM CARD ---
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-blue-400 transition-all group">
      <div className="h-1.5 bg-blue-600 w-full" />
      <div className="p-5">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
            {exam.examCode}
          </span>
          <div className="flex items-center text-gray-400 text-xs">
            <ClockIcon className="w-3 h-3 mr-1" />
            {formatTime(exam.startTime)}
          </div>
        </div>

        <h4 className="text-lg font-bold text-gray-800 mb-4 group-hover:text-blue-700 transition-colors truncate">
          {exam.title || 'Exam'}
        </h4>

        <div className="flex items-center text-sm text-gray-600 mb-5">
          <CalendarIcon className="w-4 h-4 mr-2 text-gray-400" />
          <span>{formatDate(exam.startTime)}</span>
        </div>

        <button
          onClick={handleStartExam}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 shadow-sm"
        >
          <PlayIcon className="w-4 h-4" />
          <span>Start Exam</span>
        </button>
      </div>
    </div>
  );
};

const CandidateDashboard = ({ user, dashboardData, view }) => {
  const { upcomingExams = [], pastSubmissions = [] } = dashboardData || {};

  return (
    <div className="max-w-7xl mx-auto space-y-10">
      <header>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Welcome back, {user?.name?.split(' ')[0]}!
        </h1>
        <p className="text-gray-500 mt-1">Here is what is happening with your assessments.</p>
      </header>

      {/* Alert Banner */}
      <div className="bg-white border border-blue-100 p-4 rounded-xl shadow-sm flex items-start">
        <div className="bg-blue-50 p-2 rounded-lg mr-4">
          <CheckCircleIcon className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm">System Ready</p>
          <p className="text-sm text-gray-600">
            All systems are operational. Please ensure a stable internet connection before starting any proctored session.
          </p>
        </div>
      </div>

      {/* Upcoming Section */}
      {(view === 'dashboard' || view === 'upcoming') && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-800">Upcoming Exams</h2>
            {view === 'dashboard' && upcomingExams.length > 4 && (
              <button className="text-sm font-semibold text-blue-600 hover:underline">View all</button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {upcomingExams.length > 0 ? (
              upcomingExams.map(exam => (
                <ExamCard key={exam._id} exam={exam} type="upcoming" />
              ))
            ) : (
              <div className="col-span-full py-12 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-500">
                <CalendarIcon className="w-10 h-10 mb-2 text-gray-300" />
                <p>No upcoming exams scheduled.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Past Results Section */}
      {(view === 'dashboard' || view === 'past') && (
        <section className="pb-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-800">Academic History</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {pastSubmissions.length > 0 ? (
              pastSubmissions.map(sub => (
                <ExamCard key={sub._id} exam={sub} type="past" />
              ))
            ) : (
              <div className="col-span-full py-12 bg-gray-50 rounded-2xl flex flex-col items-center justify-center text-gray-400">
                <p>No past results found.</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default CandidateDashboard;