import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import CreateAssignment from './pages/teacher/CreateAssignment';
import Dashboard from './pages/teacher/Dashboard';
import AssignmentDetail from './pages/teacher/AssignmentDetail';
import StudentView from './pages/student/StudentView';
import Results from './pages/Results';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white">
        <Navbar />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/teacher/create" element={<CreateAssignment />} />
          <Route path="/teacher/dashboard" element={<Dashboard />} />
          <Route path="/teacher/assignments/:assignmentId" element={<AssignmentDetail />} />
          <Route path="/student/:assignmentId" element={<StudentView />} />
          <Route path="/results/:submissionId" element={<Results />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
