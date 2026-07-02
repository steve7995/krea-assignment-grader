import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

export default function ProtectedRoute({
  role,
  children,
}: {
  role: 'teacher' | 'student';
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Loading..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;

  return <>{children}</>;
}
