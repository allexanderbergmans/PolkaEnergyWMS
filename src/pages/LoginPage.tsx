import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authService, mapSupabaseUser } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Zap } from 'lucide-react';

type AuthStep = 'email' | 'otp';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<AuthStep>('email');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [otp, setOtp] = useState('');

  const handleSendOtp = async () => {
    if (!email) return;
    setLoading(true);
    try {
      await authService.sendOtp(email);
      toast.success('Verification code sent');
      setStep('otp');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async () => {
    if (!otp || !password || !username) return;
    setLoading(true);
    try {
      const user = await authService.verifyOtpAndSetPassword(email, otp, password, username);
      if (user) {
        await supabase.from('employee_settings').upsert(
          { user_id: user.id, hourly_wage: 0, is_admin: false },
          { onConflict: 'user_id' }
        );
        await supabase.from('user_profiles').upsert(
          { id: user.id, username, email: user.email || email },
          { onConflict: 'id' }
        );
        login(mapSupabaseUser(user));
        navigate('/');
      }
    } catch (e: unknown) {
      toast.error((e as Error).message);
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      const user = await authService.signInWithPassword(email, password);
      login(mapSupabaseUser(user));
      navigate('/');
    } catch (e: unknown) {
      toast.error((e as Error).message);
      setLoading(false);
    }
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setStep('email');
    setEmail('');
    setPassword('');
    setOtp('');
    setUsername('');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <div className="w-7 h-7 bg-foreground rounded-md flex items-center justify-center">
            <Zap className="w-4 h-4 text-background" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-foreground">Polka Energy</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          {mode === 'login' ? 'Welcome back' : step === 'email' ? 'Create account' : 'Verify email'}
        </h1>
        <p className="text-muted-foreground text-sm mb-8">
          {mode === 'login'
            ? 'Sign in to your account'
            : step === 'email'
            ? 'Enter your work email to get started'
            : `Enter the code sent to ${email}`}
        </p>

        {/* Mode Toggle */}
        <div className="flex mb-6 border border-border rounded-md p-0.5 bg-muted">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-1.5 rounded text-sm font-medium transition-all duration-150 ${
                mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {m === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        {/* Login Form */}
        {mode === 'login' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@polkaenergy.com"
                className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <button
              onClick={handleLogin}
              disabled={loading || !email || !password}
              className="w-full bg-foreground text-background text-sm font-medium py-2.5 rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity mt-1 flex items-center justify-center gap-2"
            >
              {loading && <div className="w-3.5 h-3.5 border-2 border-background/40 border-t-background rounded-full animate-spin" />}
              Sign in
            </button>
          </div>
        )}

        {/* Register: Email Step */}
        {mode === 'register' && step === 'email' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Work email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@polkaenergy.com"
                className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
              />
            </div>
            <button
              onClick={handleSendOtp}
              disabled={loading || !email}
              className="w-full bg-foreground text-background text-sm font-medium py-2.5 rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
            >
              {loading && <div className="w-3.5 h-3.5 border-2 border-background/40 border-t-background rounded-full animate-spin" />}
              Continue
            </button>
          </div>
        )}

        {/* Register: OTP + Details Step */}
        {mode === 'register' && step === 'otp' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Verification code</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="0000"
                maxLength={4}
                className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm font-mono tracking-widest outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Full name</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your name"
                className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={handleVerifyAndRegister}
              disabled={loading || !otp || !password || !username}
              className="w-full bg-foreground text-background text-sm font-medium py-2.5 rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
            >
              {loading && <div className="w-3.5 h-3.5 border-2 border-background/40 border-t-background rounded-full animate-spin" />}
              Create account
            </button>
            <button
              onClick={() => setStep('email')}
              className="w-full text-muted-foreground text-sm hover:text-foreground transition-colors py-1"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
