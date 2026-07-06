import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="text-indigo-600 font-bold text-lg tracking-tight">
          GradeAI
        </Link>
        <div className="flex items-center gap-4">
          {(user?.role === 'teacher' || user?.role === 'admin') && (
            <>
              <button
                onClick={() => navigate('/teacher/dashboard')}
                className="text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                Dashboard
              </button>
              <button
                onClick={() => navigate('/teacher/create')}
                className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                New Assignment
              </button>
            </>
          )}
          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin/students')}
              className="text-sm text-gray-600 hover:text-indigo-600 transition-colors"
            >
              Students
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {user.name} <span className="text-gray-300">&middot;</span> {user.role}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-red-600 transition-colors"
              >
                Log out
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="text-sm text-indigo-600 font-medium hover:underline"
            >
              Log in
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
