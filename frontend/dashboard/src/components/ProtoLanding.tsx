import { motion } from 'motion/react';
import {
  Leaf,
  ArrowRight,
  Smartphone,
  HardDrive,
  Droplets,
  Gauge,
  Cpu,
  ShieldCheck,
} from 'lucide-react';
import chamberModel from '../assets/chamber-model.png';
import { Logo, Btn, Card, Badge } from './ProtoPrimitives';

export function ProtoLanding({
  onSignIn,
  onSignUp,
  onDownload,
}: {
  onSignIn: () => void;
  onSignUp: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a
            href="/"
            aria-label="SproutSync home"
            className="group flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Logo className="h-16 w-16 transition-transform duration-200 group-hover:scale-105 sm:h-20 sm:w-20" />
            <span className="hidden text-xl font-bold tracking-tight sm:inline">SproutSync</span>
          </a>
          <div className="flex items-center gap-2">
            <Btn variant="ghost" onClick={onSignIn} className="px-3 sm:px-4">
              Sign in
            </Btn>
            <Btn onClick={onSignUp}>
              Sign up <ArrowRight className="h-4 w-4" />
            </Btn>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-2 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge tone="green">
              <Leaf className="h-3.5 w-3.5" /> Smart Mung Bean Sprout System
            </Badge>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
              Grow fresh sprouts <span className="text-primary">without the guesswork.</span>
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              SproutSync automatically waters your mung bean sprouts on a set schedule, keeps an eye on
              growing conditions, and gives you a clear record of every batch — so you can focus on
              growing, not constant monitoring.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Btn onClick={onSignUp} className="px-6 py-3">
                Get started <ArrowRight className="h-4 w-4" />
              </Btn>
              <Btn variant="outline" onClick={onDownload} className="px-6 py-3">
                <Smartphone className="h-4 w-4" /> Download mobile app
              </Btn>
            </div>
            <div className="mt-6 flex items-center gap-5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <HardDrive className="h-4 w-4 text-primary" /> Works without internet
              </span>
              <span className="flex items-center gap-1.5">
                <Droplets className="h-4 w-4 text-primary" /> Tracks every drop
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative"
          >
            <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-slate-100 to-emerald-50 shadow-xl shadow-emerald-900/10">
              <motion.img
                src={chamberModel}
                alt="SproutSync automated growing chamber"
                className="h-full w-full object-cover"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Droplets,
              t: 'Automatic watering',
              d: 'Waters each tray one by one on a set schedule, checks it drains properly, then moves to the next — hands-free.',
            },
            {
              icon: Gauge,
              t: 'Track every batch',
              d: 'See where each batch is in its journey — from soaking to harvest-ready — in a single, easy-to-read view.',
            },
            {
              icon: Cpu,
              t: 'Live condition checks',
              d: 'Keeps tabs on temperature, humidity, water levels, and more so your sprouts always have the right environment.',
            },
            {
              icon: HardDrive,
              t: 'Works without internet',
              d: 'If the connection drops, SproutSync keeps tracking everything on its own — and catches up the moment you are back online.',
            },
            {
              icon: Leaf,
              t: 'Water use tracking',
              d: 'Logs how much water each tray uses so you can manage resources wisely and review water use alongside your yield.',
            },
            {
              icon: ShieldCheck,
              t: 'Smart alerts',
              d: 'Sends a heads-up the moment something needs attention — like a low water tank, a drainage issue, or an offline device.',
            },
          ].map((f) => (
            <Card key={f.t}>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-bold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Mobile band */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-green-700 p-8 text-white sm:p-12">
          <div className="grid items-center gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">
                Check on your sprouts from anywhere.
              </h2>
              <p className="mt-2 max-w-md text-emerald-50">
                The SproutSync app keeps you in the loop — see how your batches are doing, get alerts,
                and follow your watering schedule right from your phone.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={onDownload}
                  className="flex items-center gap-2 rounded-xl bg-white/15 px-5 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/25"
                >
                  <Smartphone className="h-5 w-5" /> Download mobile app
                </button>
              </div>
            </div>
            <div className="flex justify-center sm:justify-end">
              <div className="w-40 rounded-3xl border-4 border-white/20 bg-white/10 p-3 backdrop-blur">
                <div className="rounded-2xl bg-white p-3 text-emerald-900">
                  <Logo className="mx-auto h-10 w-10" />
                  <p className="mt-2 text-center text-xs font-bold">SproutSync</p>
                  <div className="mt-3 space-y-2">
                    <div className="h-2 rounded-full bg-emerald-100" />
                    <div className="h-2 w-2/3 rounded-full bg-emerald-100" />
                    <div className="h-10 rounded-lg bg-primary/10" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>© 2026 SproutSync · Automated Mung Bean Sprout Production</p>
      </footer>
    </div>
  );
}
