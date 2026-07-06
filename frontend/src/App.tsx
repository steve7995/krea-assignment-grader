import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import CreateAssignment from './pages/teacher/CreateAssignment';
import Dashboard from './pages/teacher/Dashboard';
import AssignmentDetail from './pages/teacher/AssignmentDetail';
import StudentView from './pages/student/StudentView';
import Results from './pages/Results';
import Students from './pages/admin/Students';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-white">
          <Navbar />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/teacher/create"
              element={
                <ProtectedRoute role="teacher">
                  <CreateAssignment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/dashboard"
              element={
                <ProtectedRoute role="teacher">
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/assignments/:assignmentId"
              element={
                <ProtectedRoute role="teacher">
                  <AssignmentDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/:assignmentId"
              element={
                <ProtectedRoute role="student">
                  <StudentView />
                </ProtectedRoute>
              }
            />
            <Route path="/results/:submissionId" element={<Results />} />
            <Route
              path="/admin/students"
              element={
                <ProtectedRoute role="admin">
                  <Students />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
