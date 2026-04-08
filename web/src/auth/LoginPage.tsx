import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { appEnv } from '@/config/env';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Sparkles, Zap, Network } from 'lucide-react';

const initialMemberId = () =>
  appEnv.loginPrefillMemberId || (import.meta.env.DEV ? 'owner_1' : '');
const initialPassword = () =>
  appEnv.loginPrefillPassword || (import.meta.env.DEV ? 'admin' : '');

// ---------------------------------------------------------------------------
// Animated network canvas background
// ---------------------------------------------------------------------------

const NetworkBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const PARTICLE_COUNT = 60;
    const CONNECTION_DIST = 220;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      pulse: number;
      pulseSpeed: number;
    }> = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.8 + 0.8,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.01 + Math.random() * 0.02,
      });
    }

    let raf = 0;

    function animate() {
      if (!ctx || !canvas) return;

      // Clear fully each frame — no white accumulation
      ctx.clearRect(0, 0, w, h);

      // Draw connections first (behind particles)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST);
            // Brighter near center, softer at ends
            const lineGrad = ctx.createLinearGradient(p.x, p.y, p2.x, p2.y);
            lineGrad.addColorStop(0, `rgba(62, 207, 174, ${alpha * 0.35})`);
            lineGrad.addColorStop(0.5, `rgba(20, 184, 166, ${alpha * 0.25})`);
            lineGrad.addColorStop(1, `rgba(62, 207, 174, ${alpha * 0.35})`);

            ctx.strokeStyle = lineGrad;
            ctx.lineWidth = alpha * 1.2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      // Draw particles with glow
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;

        // Soft bounce at edges
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        const pulseScale = 1 + Math.sin(p.pulse) * 0.3;
        const glowRadius = p.radius * 6 * pulseScale;

        // Outer glow
        const outerGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        outerGlow.addColorStop(0, 'rgba(62, 207, 174, 0.4)');
        outerGlow.addColorStop(0.3, 'rgba(62, 207, 174, 0.12)');
        outerGlow.addColorStop(0.7, 'rgba(20, 184, 166, 0.04)');
        outerGlow.addColorStop(1, 'rgba(20, 184, 166, 0)');

        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        const coreRadius = p.radius * pulseScale;
        const coreGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, coreRadius * 2);
        coreGlow.addColorStop(0, 'rgba(200, 255, 240, 0.9)');
        coreGlow.addColorStop(0.4, 'rgba(62, 207, 174, 0.7)');
        coreGlow.addColorStop(1, 'rgba(62, 207, 174, 0)');

        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, coreRadius * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 opacity-70" />;
};

// ---------------------------------------------------------------------------
// Feature highlights data
// ---------------------------------------------------------------------------

const features = [
  { icon: Network, text: 'Distributed multi-agent orchestration' },
  { icon: Zap, text: 'Real-time Git-native task execution' },
  { icon: Sparkles, text: 'Enterprise-grade approval workflows' },
];

// ---------------------------------------------------------------------------
// LoginPage
// ---------------------------------------------------------------------------

export const LoginPage = () => {
  const { login } = useAuth();
  const [memberId, setMemberId] = useState(initialMemberId);
  const [password, setPassword] = useState(initialPassword);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);
      try {
        await login(memberId.trim(), password);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setLoading(false);
      }
    },
    [login, memberId, password]
  );

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-teal-950" />

      {/* Animated canvas overlay */}
      <NetworkBackground />

      {/* Decorative gradient orbs */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-br from-cyan-400/20 to-teal-500/20 rounded-full blur-3xl animate-pulse" />
      <div
        className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-teal-400/20 to-cyan-500/20 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: '1s' }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-emerald-400/10 to-cyan-500/10 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: '2s' }}
      />

      {/* Main content — 2-column on desktop */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
        {/* Left side — Branding (hidden on mobile) */}
        <div className="hidden lg:block space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border border-cyan-500/20 backdrop-blur-sm">
              <Sparkles size={16} className="text-cyan-600 dark:text-cyan-400" />
              <span className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                Multi-Agent Production Platform
              </span>
            </div>

            <h1 className="text-6xl font-bold bg-gradient-to-br from-slate-900 via-slate-700 to-slate-600 dark:from-white dark:via-slate-200 dark:to-slate-400 bg-clip-text text-transparent leading-tight">
              Open Kraken
            </h1>

            <p className="text-xl text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg">
              Orchestrate AI agents, manage Git workspaces, and collaborate in real-time across
              distributed teams.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="space-y-4 pt-4">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-4 rounded-xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 hover:border-cyan-500/50 transition-all duration-300"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center">
                  <feature.icon size={20} className="text-white" />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {feature.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right side — Login form */}
        <div className="w-full max-w-md mx-auto lg:mx-0">
          {/* Glassmorphism card */}
          <div className="relative group">
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-teal-600 rounded-2xl blur-xl opacity-25 group-hover:opacity-40 transition duration-500" />

            {/* Card */}
            <div className="relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-2xl p-8">
              {/* Logo */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 mb-4 shadow-lg shadow-cyan-500/50">
                  <span className="text-3xl font-bold text-white">K</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  Welcome back
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Sign in to your workspace
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="memberId"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Member ID
                  </Label>
                  <Input
                    id="memberId"
                    type="text"
                    value={memberId}
                    onChange={(e) => setMemberId(e.target.value)}
                    placeholder="Enter your member ID"
                    className="h-11 bg-white/50 dark:bg-slate-800/50 border-slate-300 dark:border-slate-600 focus:border-cyan-500 dark:focus:border-cyan-400 transition-colors"
                    autoComplete="username"
                    autoFocus
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-11 bg-white/50 dark:bg-slate-800/50 border-slate-300 dark:border-slate-600 focus:border-cyan-500 dark:focus:border-cyan-400 transition-colors"
                    autoComplete="current-password"
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div
                    className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white font-medium shadow-lg shadow-cyan-500/30 transition-all duration-300"
                  disabled={loading || !memberId.trim() || !password}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign In
                      <ArrowRight size={16} />
                    </span>
                  )}
                </Button>

                <div className="pt-4 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-800/50 px-4 py-2 rounded-lg inline-block">
                    <Sparkles size={12} className="inline mr-1" />
                    Demo credentials pre-filled. Click &quot;Sign In&quot; to continue.
                  </p>
                </div>
              </form>
            </div>
          </div>

          {/* Mobile branding */}
          <div className="lg:hidden mt-8 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Multi-Agent Production Platform
            </p>
          </div>
        </div>
      </div>

      {/* Bottom decorative line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
    </div>
  );
};
