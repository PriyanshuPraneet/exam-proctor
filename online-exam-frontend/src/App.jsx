import React, { useState, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import axios from 'axios';

import Login from './components/Login';
import Dashboard from './pages/Dashboard';
import ExamTakerPage from './pages/ExamTakerPage';
import ExamResultsPage from './pages/ExamResultsPage';
import OrganizerExamPaper from './pages/OrganizerExamPaper';
import ExamsManagementPage from './pages/ExamsManagementPage';
import CalibrationPage from './pages/CalibrationPage';
import './App.css';

const API_BASE_URL = 'http://localhost:5000/api';

/* =========================
   PROTECTED ROUTE
========================= */
const ProtectedRoute = ({ children, user }) => {
  const token = localStorage.getItem('authToken');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Token exists but user not restored yet
  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center text-lg text-blue-600">
        Restoring session...
      </div>
    );
  }

  return children;
};

function App() {
  const [user, setUser] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  /* =========================
     RESTORE SESSION
  ========================= */
  useEffect(() => {
    const restoreUser = async () => {
      const token = localStorage.getItem('authToken');

      if (!token) {
        setLoadingSession(false);
        return;
      }

      try {
        const { data } = await axios.get(
          `${API_BASE_URL}/auth/profile`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setUser(data);
      } catch (err) {
        console.error('Session restore failed:', err);
        localStorage.removeItem('authToken');
        setUser(null);
      } finally {
        setLoadingSession(false);
      }
    };

    restoreUser();
  }, []);

  /* =========================
     AUTH HANDLERS
  ========================= */
  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
  };

  if (loadingSession) {
    return (
      <div className="h-screen flex items-center justify-center text-lg text-blue-600">
        Initializing application...
      </div>
    );
  }

  /* =========================
     ROUTES
  ========================= */
  return (
    <Router>
      <Routes>

        {/* ================= LOGIN ================= */}
        <Route
          path="/login"
          element={
            localStorage.getItem('authToken') ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Login onAuthSuccess={handleLoginSuccess} />
            )
          }
        />

        {/* ================= DASHBOARD ================= */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute user={user}>
              <Dashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />

        {/* ================= CALIBRATION (runs before exam) ================= */}
        <Route
          path="/calibrate"
          element={
            <ProtectedRoute user={user}>
              <CalibrationPage />
            </ProtectedRoute>
          }
        />

        {/* ================= EXAM (candidate — examCode based) ================= */}
        <Route
          path="/exam"
          element={
            <ProtectedRoute user={user}>
              <ExamTakerPage />
            </ProtectedRoute>
          }
        />

        {/* ================= EXAM (optional — examId based, future use) ================= */}
        <Route
          path="/exam/:examId"
          element={
            <ProtectedRoute user={user}>
              <ExamTakerPage />
            </ProtectedRoute>
          }
        />

        {/* ================= ORGANIZER ROUTES ================= */}
        <Route
          path="/organizer/exams"
          element={
            <ProtectedRoute user={user}>
              <ExamsManagementPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/organizer/exams/:examId"
          element={
            <ProtectedRoute user={user}>
              <OrganizerExamPaper />
            </ProtectedRoute>
          }
        />

        <Route
          path="/organizer/exams/:examId/results"
          element={
            <ProtectedRoute user={user}>
              <ExamResultsPage />
            </ProtectedRoute>
          }
        />

        {/* ================= RESULTS ================= */}
        <Route
          path="/results/:examId"
          element={
            <ProtectedRoute user={user}>
              <ExamResultsPage />
            </ProtectedRoute>
          }
        />

        {/* ================= FALLBACK ================= */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />

      </Routes>
    </Router>
  );
}

export default App;