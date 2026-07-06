import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

export default function ProtectedRoute({
  role,
  children,
}: {
  role: 'teacher' | 'student' | 'admin';
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Loading..." />;
  if (!user) return <Navigate to="/login" replace />;

  // Admin is a superset of teacher access, but "admin" routes stay admin-only.
  const allowed = user.role === role || (role === 'teacher' && user.role === 'admin');
  if (!allowed) return <Navigate to="/" replace />;

  return <>{children}</>;
}
