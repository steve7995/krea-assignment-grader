import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">
          AI-Powered Assignment Grader
        </h1>
        <p className="text-gray-500 text-lg max-w-md mx-auto">
          Create assignments with rubrics, let students submit answers, and get instant AI-generated grades and feedback.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-5 w-full max-w-md">
        <button
          onClick={() => navigate('/teacher/dashboard')}
          className="flex-1 flex flex-col items-center gap-3 p-8 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <span className="text-xl font-semibold">I am a Teacher</span>
          <span className="text-indigo-200 text-sm text-center">
            Create assignments and view student results
          </span>
        </button>

        <button
          onClick={() => {
            const id = prompt('Enter the assignment ID shared by your teacher:');
            if (id?.trim()) navigate(`/student/${id.trim()}`);
          }}
          className="flex-1 flex flex-col items-center gap-3 p-8 bg-white text-gray-900 rounded-2xl hover:bg-gray-50 transition-colors shadow-lg border border-gray-200"
        >
          <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <span className="text-xl font-semibold">I am a Student</span>
          <span className="text-gray-500 text-sm text-center">
            Enter your assignment ID to get started
          </span>
        </button>
      </div>
    </div>
  );
}
