import React, { useEffect, useState } from 'react';
import {
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Fuel,
  Gauge,
  Link2,
  MapPin,
  Navigation,
  Route,
  Sparkles,
  X,
} from 'lucide-react';
import { useTripStore } from '../store/useTripStore';

interface OnboardingSlide {
  stepLabel: string;
  title: string;
  description: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    stepLabel: 'Step 1 of 3',
    title: 'Paste Your Google Maps Route',
    description:
      'Build your route in Google Maps, copy the directions URL from your browser address bar, and paste it into Step 1 of the Destination tab.',
  },
  {
    stepLabel: 'Step 2 of 3',
    title: 'Configure Your Vehicle Specs',
    description:
      'Choose your Year, Make, Model, and Trim from the North American vehicle catalog—or customize Highway Efficiency, City Efficiency, Tank Capacity, and departure fuel reserves.',
  },
  {
    stepLabel: 'Step 3 of 3',
    title: 'View Your Optimized Route & Stops',
    description:
      'Switch to the Your Route tab to inspect your minimum-cost refueling plan, featuring departure/arrival tank levels, highway vs. city driving splits between stops, and exact pump volumes.',
  },
];

export const OnboardingModal: React.FC = () => {
  const isOnboardingOpen = useTripStore((s) => s.isOnboardingOpen);
  const setIsOnboardingOpen = useTripStore((s) => s.setIsOnboardingOpen);

  const [currentSlide, setCurrentSlide] = useState(0);

  // Reset to first slide whenever modal opens
  useEffect(() => {
    if (isOnboardingOpen) {
      setCurrentSlide(0);
    }
  }, [isOnboardingOpen]);

  // Keyboard navigation (Escape to close, ArrowLeft/ArrowRight to navigate)
  useEffect(() => {
    if (!isOnboardingOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOnboardingOpen(false);
      } else if (e.key === 'ArrowRight') {
        setCurrentSlide((prev) => Math.min(SLIDES.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide((prev) => Math.max(0, prev - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOnboardingOpen, setIsOnboardingOpen]);

  if (!isOnboardingOpen) return null;

  const slide = SLIDES[currentSlide];
  const isFirst = currentSlide === 0;
  const isLast = currentSlide === SLIDES.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in"
      onClick={() => setIsOnboardingOpen(false)}
    >
      <div
        className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                Welcome to FuelOptima · {slide.stepLabel}
              </div>
              <h2 id="onboarding-modal-title" className="text-base font-bold text-slate-100">
                {slide.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOnboardingOpen(false)}
            aria-label="Close onboarding"
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slide Body */}
        <div className="p-6 space-y-5">
          {/* Interactive Visual Preview Card */}
          <div className="rounded-xl bg-slate-950 border border-slate-800/90 p-4 shadow-inner">
            {currentSlide === 0 && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                  <span className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-emerald-400" />
                    <span>1. Route Reconstruction</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    Destination Tab
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 overflow-hidden">
                    <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      https://www.google.com/maps/dir/Toronto,+ON/Montreal,+QC/...
                    </span>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold shrink-0">
                    Reconstruct
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300">
                    <Compass className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="truncate">Origin: Toronto, ON</span>
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">Dest: Montreal, QC</span>
                  </div>
                </div>
              </div>
            )}

            {currentSlide === 1 && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                  <span className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-emerald-400" />
                    <span>2. Vehicle Specs</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full">
                    Open Canada · Custom Overrides
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                  <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200">
                    <span className="block text-[9px] text-slate-500 uppercase">Year</span>
                    2024
                  </div>
                  <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200">
                    <span className="block text-[9px] text-slate-500 uppercase">Make</span>
                    Honda
                  </div>
                  <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200">
                    <span className="block text-[9px] text-slate-500 uppercase">Model</span>
                    Civic
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Highway Efficiency</div>
                    <div className="flex items-baseline justify-between mt-1 font-mono">
                      <span className="text-sm font-semibold text-emerald-400">6.1 L/100km</span>
                      <span className="text-[10px] text-slate-500">39 MPG</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <div className="text-[10px] text-slate-400">City Efficiency</div>
                    <div className="flex items-baseline justify-between mt-1 font-mono">
                      <span className="text-sm font-semibold text-emerald-400">7.8 L/100km</span>
                      <span className="text-[10px] text-slate-500">30 MPG</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] font-mono">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Initial Fuel at Departure</span>
                  </span>
                  <span className="text-emerald-400 font-semibold">35% (16.4 L)</span>
                </div>
              </div>
            )}

            {currentSlide === 2 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                  <span className="flex items-center gap-2">
                    <Route className="w-4 h-4 text-emerald-400" />
                    <span>Your Route Ledger</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    Mathematical Savings
                  </span>
                </div>

                {/* Departure Summary Row */}
                <div className="px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-xs font-semibold text-slate-200">Depart: Toronto</span>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-xs font-semibold text-emerald-400">35%</div>
                    <div className="text-[10px] text-slate-400">16.4 L</div>
                  </div>
                </div>

                {/* Left-Aligned Leg Split Pill */}
                <div className="flex items-center justify-start">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
                    <span className="text-slate-200 font-semibold">192.4 km drive</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-sky-400">🛣️ 182.9 km Hwy</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-amber-400">🏙️ 9.5 km City</span>
                  </div>
                </div>

                {/* Sample Stop Card */}
                <div className="p-3 rounded-lg bg-slate-900/90 border border-emerald-500/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 font-mono">
                      <Fuel className="w-3.5 h-3.5" />
                      <span>STOP #1 · Kingston Pioneer</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">$28.40</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-1.5 rounded bg-slate-950 font-mono text-center">
                    <div>
                      <div className="text-[9px] text-slate-400">Arrive Tank</div>
                      <div className="text-[11px] font-semibold text-amber-400">10%</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400">Pump Volume</div>
                      <div className="text-[11px] font-semibold text-emerald-400">+19.8 L</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400">Depart Tank</div>
                      <div className="text-[11px] font-semibold text-slate-100">52%</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-slate-300 leading-relaxed">{slide.description}</p>
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-4">
          {/* Interactive Slide Indicator Dots */}
          <div className="flex items-center gap-2" role="tablist" aria-label="Onboarding slides">
            {SLIDES.map((s, idx) => (
              <button
                key={s.stepLabel}
                type="button"
                role="tab"
                aria-selected={currentSlide === idx}
                aria-label={`Go to ${s.stepLabel}: ${s.title}`}
                onClick={() => setCurrentSlide(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  currentSlide === idx
                    ? 'w-6 bg-emerald-400'
                    : 'w-2 bg-slate-700 hover:bg-slate-600'
                }`}
              />
            ))}
          </div>

          {/* Navigation Actions */}
          <div className="flex items-center gap-2">
            {!isLast && (
              <button
                type="button"
                onClick={() => setIsOnboardingOpen(false)}
                className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Skip
              </button>
            )}
            {!isFirst && (
              <button
                type="button"
                onClick={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
                className="flex items-center gap-1 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}

            {isLast ? (
              <button
                type="button"
                onClick={() => setIsOnboardingOpen(false)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-sm shadow-emerald-500/20"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Get Started</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentSlide((prev) => Math.min(SLIDES.length - 1, prev + 1))}
                className="flex items-center gap-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-sm shadow-emerald-500/20"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
