import { useEffect, useState } from 'react';
import api from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { StudentAccount } from '../../types';

export default function Students() {
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ student: StudentAccount; password: string } | null>(null);

  useEffect(() => {
    api
      .get<StudentAccount[]>('/admin/students')
      .then((res) => setStudents(res.data))
      .catch(() => setError('Failed to load students.'))
      .finally(() => setLoading(false));
  }, []);

  const handleReset = async (student: StudentAccount) => {
    if (!window.confirm(`Reset the password for ${student.name} (${student.email})?`)) return;
    setResettingId(student.id);
    setError('');
    try {
      const res = await api.post<{ temporary_password: string }>(`/admin/students/${student.id}/reset-password`);
      setResetResult({ student, password: res.data.temporary_password });
    } catch {
      setError('Failed to reset password. Please try again.');
    } finally {
      setResettingId(null);
    }
  };

  if (loading) return <LoadingSpinner message="Loading students..." />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Students</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {resetResult && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-4 text-sm mb-6">
          <p className="font-medium text-indigo-900 mb-1">
            New temporary password for {resetResult.student.name}:
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-white border border-indigo-200 rounded px-3 py-1.5 font-mono text-indigo-700">
              {resetResult.password}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(resetResult.password)}
              className="text-indigo-600 hover:underline text-xs font-medium"
            >
              Copy
            </button>
          </div>
          <p className="text-indigo-500 text-xs mt-2">
            Share this with the student directly — it won't be shown again.
          </p>
          <button
            onClick={() => setResetResult(null)}
            className="text-gray-400 hover:text-gray-600 text-xs mt-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {students.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="font-medium">No students yet</p>
          <p className="text-sm mt-1">Students will appear here once they sign up.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="py-3 px-5 font-medium">Name</th>
                <th className="py-3 px-5 font-medium">Email</th>
                <th className="py-3 px-5 font-medium">Joined</th>
                <th className="py-3 px-5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 px-5 font-medium text-gray-900">{s.name}</td>
                  <td className="py-3 px-5 text-gray-600">{s.email}</td>
                  <td className="py-3 px-5 text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-5 text-right">
                    <button
                      onClick={() => handleReset(s)}
                      disabled={resettingId === s.id}
                      className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40"
                    >
                      {resettingId === s.id ? 'Resetting...' : 'Reset password'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
