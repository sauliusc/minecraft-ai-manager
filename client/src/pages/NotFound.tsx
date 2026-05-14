import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-200 mb-4">404</h1>
        <p className="text-gray-600 mb-6">Page not found</p>
        <Link to="/" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
