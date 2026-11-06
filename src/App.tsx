/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { MapCanvas } from './components/MapCanvas';
import { TelemetryChart } from './components/TelemetryChart';

export default function App() {
  const [mobileView, setMobileView] = useState<'controls' | 'map'>('controls');

  return (
    <div id="top" className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Bar following 3-zone contract */}
      <TopBar />

      {/* Mobile Viewport Switcher (visible only below lg breakpoint) */}
      <div className="flex lg:hidden items-center bg-slate-900 border-b border-slate-800 px-4 py-1.5 gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMobileView('controls')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            mobileView === 'controls'
              ? 'bg-emerald-500 text-slate-950'
              : 'bg-slate-950 text-slate-400'
          }`}
        >
          Planner & Ledger
        </button>
        <button
          type="button"
          onClick={() => setMobileView('map')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            mobileView === 'map'
              ? 'bg-emerald-500 text-slate-950'
              : 'bg-slate-950 text-slate-400'
          }`}
        >
          Corridor Map & Telemetry
        </button>
      </div>

      {/* Main Split-Screen Desktop Workspace */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Sidebar (425px fixed on desktop, full width when active on mobile) */}
        <div
          className={`${
            mobileView === 'controls' ? 'flex' : 'hidden'
          } lg:flex h-full w-full lg:w-auto shrink-0 overflow-hidden`}
        >
          <LeftSidebar />
        </div>

        {/* Right Viewport: Interactive MapLibre Canvas + Bottom Telemetry Profile Chart */}
        <div
          className={`${
            mobileView === 'map' ? 'flex' : 'hidden'
          } lg:flex flex-1 flex-col h-full overflow-hidden relative`}
        >
          <MapCanvas />
          <TelemetryChart />
        </div>
      </main>
    </div>
  );
}
