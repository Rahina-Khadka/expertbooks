import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';

const PendingVerificationPage = () => {
  const { user, logout } = useAuth();
  const isRejected = user?.verificationStatus === 'rejected';

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="text-6xl mb-4">{isRejected ? '❌' : '⏳'}</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isRejected ? 'Verification Rejected' : 'Awaiting Verification'}
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            {isRejected
              ? 'Your verification was rejected by the admin. Please contact support or register again with valid documents.'
              : 'Your expert account is under review. An admin will verify your credentials shortly. You will receive an email once approved.'}
          </p>
          {isRejected ? (
            <div className="space-y-3">
              <Link to="/register"
                className="block w-full bg-indigo-500 text-white py-2.5 rounded-xl font-semibold hover:bg-indigo-600 transition-colors text-sm">
                Re-register
              </Link>
              <button onClick={logout}
                className="block w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl font-semibold hover:bg-gray-200 transition-colors text-sm">
                Logout
              </button>
            </div>
          ) : (
            <button onClick={logout}
              className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl font-semibold hover:bg-gray-200 transition-colors text-sm">
              Logout
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PendingVerificationPage;
