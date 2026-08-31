import React, { useState } from 'react';
import { User } from '../types';
import { api } from '../services/api';
import { Radio, Mail, Lock, UserCircle, Building2, Phone, ArrowRight, Eye, EyeOff, Sparkles } from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: (user: User) => void;
}

type AuthMode = 'login' | 'signup';
type SignupRole = 'attendee' | 'organizer';

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('signup');
  const [role, setRole] = useState<SignupRole>('attendee');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {

      if (mode === 'login') {
        const result = await api.login(email, password);
        if (!result.success) {
          setError(result.error || 'Login failed');
          return;
        }
        setSuccess('Welcome back! Redirecting...');
        setTimeout(() => onAuthenticated(result.user!), 600);
      } else {
        const result = await api.signup({
          email,
          password,
          name,
          role,
          organizationName: role === 'organizer' ? orgName : undefined,
          phone: phone || undefined,
        });
        if (!result.success) {
          setError(result.error || 'Signup failed');
          return;
        }
        setSuccess(role === 'organizer'
          ? '🎉 Organizer account created! Redirecting to your dashboard...'
          : '🎉 Account created! Redirecting...');
        setTimeout(() => onAuthenticated(result.user!), 800);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-auto bg-[#060710]">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#ff2d75]/10 blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#9d4edd]/10 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-[#00f0ff]/8 blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
        
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />
      </div>

      <div className="relative w-full max-w-md mx-4 py-8">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ff2d75] to-[#9d4edd] flex items-center justify-center shadow-lg shadow-pink-500/30">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <span className="font-display font-black text-4xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-pink-100 to-[#ff2d75]">
              EVNT
            </span>
          </div>
          <p className="text-sm text-slate-400 font-medium">
            {mode === 'login' ? 'Welcome back to the party' : 'Join the live experience'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="glass-panel-glow rounded-3xl p-6 sm:p-8">
          {/* Mode Toggle */}
          <div className="flex items-center rounded-2xl bg-[#0d0f1a] p-1 mb-6 border border-[#1e2336]">
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                mode === 'signup'
                  ? 'bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white shadow-lg shadow-pink-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white shadow-lg shadow-pink-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Log In
            </button>
          </div>

          {/* Role Selector (signup only) */}
          {mode === 'signup' && (
            <div className="mb-5">
              <label className="block text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-2">I am a...</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRole('attendee')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all duration-200 border ${
                    role === 'attendee'
                      ? 'bg-[#ff2d75]/15 border-[#ff2d75]/50 text-[#ff2d75] shadow-sm'
                      : 'bg-[#0d0f1a] border-[#1e2336] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <Sparkles className="w-4 h-4 mx-auto mb-1" />
                  Event Goer
                </button>
                <button
                  type="button"
                  onClick={() => setRole('organizer')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all duration-200 border ${
                    role === 'organizer'
                      ? 'bg-[#9d4edd]/15 border-[#9d4edd]/50 text-[#9d4edd] shadow-sm'
                      : 'bg-[#0d0f1a] border-[#1e2336] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <Building2 className="w-4 h-4 mx-auto mb-1" />
                  Organizer
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name (signup only) */}
            {mode === 'signup' && (
              <div className="relative">
                <UserCircle className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#0d0f1a] border border-[#1e2336] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#ff2d75]/50 focus:ring-1 focus:ring-[#ff2d75]/30 transition"
                />
              </div>
            )}

            {/* Email */}
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#0d0f1a] border border-[#1e2336] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#ff2d75]/50 focus:ring-1 focus:ring-[#ff2d75]/30 transition"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'signup' ? 'Create a password (min 6 chars)' : 'Password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={mode === 'signup' ? 6 : 1}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full pl-11 pr-11 py-3 rounded-xl bg-[#0d0f1a] border border-[#1e2336] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#ff2d75]/50 focus:ring-1 focus:ring-[#ff2d75]/30 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Organization Name (organizer signup only) */}
            {mode === 'signup' && role === 'organizer' && (
              <div className="relative animate-in fade-in slide-in-from-top-2 duration-200">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Organization / brand name"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  required
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#0d0f1a] border border-[#1e2336] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#9d4edd]/50 focus:ring-1 focus:ring-[#9d4edd]/30 transition"
                />
              </div>
            )}

            {/* Phone (signup only, optional) */}
            {mode === 'signup' && (
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#0d0f1a] border border-[#1e2336] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#ff2d75]/50 focus:ring-1 focus:ring-[#ff2d75]/30 transition"
                />
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium animate-in fade-in duration-200">
                {error}
              </div>
            )}

            {/* Success message */}
            {success && (
              <div className="px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium animate-in fade-in duration-200">
                {success}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-300 flex items-center justify-center gap-2 ${
                isLoading
                  ? 'bg-slate-700 cursor-wait'
                  : 'bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] hover:shadow-lg hover:shadow-pink-500/25 hover:scale-[1.01] active:scale-[0.99]'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Log In' : (role === 'organizer' ? 'Create Organizer Account' : 'Create Account')}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Separator + Mode Switch */}
          <div className="mt-6 pt-5 border-t border-[#1e2336] text-center">
            <span className="text-xs text-slate-500">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            </span>
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
              className="text-xs font-bold text-[#ff2d75] hover:text-[#ff5c96] transition"
            >
              {mode === 'login' ? 'Sign Up' : 'Log In'}
            </button>
          </div>

          {/* Admin hint */}
          {mode === 'signup' && (
            <p className="text-center text-[10px] text-slate-600 mt-3">
              Sign up with <span className="text-slate-400 font-mono">admin@evnt.live</span> for platform admin access
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-slate-600 mt-6 font-medium">
          Ed25519 Cryptographic Tickets · Privacy-First Social Graph · Real-Time Telemetry
        </p>
      </div>
    </div>
  );
};
