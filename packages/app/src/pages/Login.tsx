import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useTheme } from '../contexts/ThemeContext';

function LoginPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement actual authentication
    console.log('Login:', { email, password });
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-primary-bg flex items-center justify-center px-4">
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        type="button"
        className="fixed top-6 right-6 p-3 rounded-full hover:bg-sage-light/15 transition-colors text-text-primary"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Conversation Coach</h1>
          <p className="text-text-secondary">Practice difficult conversations with AI</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-card-bg border border-border-medium rounded-2xl px-6 py-4 text-base text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-sage-medium focus:border-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-card-bg border border-border-medium rounded-2xl px-6 py-4 text-base text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-sage-medium focus:border-transparent"
              required
            />
          </div>

          <Button type="submit" variant="primary" className="w-full py-4 text-lg">
            Sign In
          </Button>

          <p className="text-center text-sm text-text-secondary">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/signup')}
              className="text-sage-medium hover:text-sage-strong underline"
            >
              Sign up
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
