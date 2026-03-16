import { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const isAlive = sessionStorage.getItem('session_alive');
    if (!isAlive) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    // Verify token + get fresh user data from API
    api.get('/users/profile')
      .then(res => {
        const fresh = { ...authService.getCurrentUser(), ...res.data };
        localStorage.setItem('user', JSON.stringify(fresh));
        setUser(fresh);
      })
      .catch(() => {
        // Token invalid — fall back to cached user
        const cached = authService.getCurrentUser();
        setUser(cached);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const userData = await authService.login(credentials);
    sessionStorage.setItem('session_alive', '1'); // mark session as active
    setUser(userData);
    return userData;
  };

  const register = async (userData) => {
    const newUser = await authService.register(userData);
    sessionStorage.setItem('session_alive', '1');
    setUser(newUser);
    return newUser;
  };

  const logout = () => {
    authService.logout();
    sessionStorage.removeItem('session_alive');
    setUser(null);
  };

  // Called by GoogleAuthSuccessPage after OAuth login
  const setUserFromToken = (userData) => {
    sessionStorage.setItem('session_alive', '1');
    setUser(userData);
  };

  const value = {
    user,
    login,
    register,
    logout,
    loading,
    isAuthenticated: !!user,
    setUserFromToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
