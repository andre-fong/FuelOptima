import React from 'react';
import { Settings } from 'lucide-react';
import { exportStationsToCsv } from '../lib/pricing/pricingEngine';
import { useTripStore, type SidebarTab } from '../store/useTripStore';

export const TopBar: React.FC = () => {
  const activeTab = useTripStore((s) => s.activeTab);
  const setActiveTab = useTripStore((s) => s.setActiveTab);
  const pricedStations = useTripStore((s) => s.pricedStations);
  const unitSystem = useTripStore((s) => s.unitSystem);
  const setIsSettingsOpen = useTripStore((s) => s.setIsSettingsOpen);

  const navItems: Array<{ id: SidebarTab; label: string }> = [
    { id: 'route', label: 'Destination' },
    { id: 'stations', label: `Stations (${pricedStations.length})` },
    { id: 'ledger', label: 'Your Route' },
  ];

  const handleExportCsv = () => {
    const csv = exportStationsToCsv(pricedStations, unitSystem);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fueloptima-corridor-stations-${unitSystem}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3 bg-slate-950 border-b border-slate-800/90 shrink-0 z-30">
      {/* Zone 1: Single text element wordmark */}
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          setActiveTab('route');
        }}
        className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
      >
        FuelOptima
      </a>

      {/* Zone 2: 4 concise single-line text navigation links */}
      <nav
        aria-label="Workspace sections"
        className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                isActive
                  ? 'text-emerald-400 border-emerald-500 font-semibold'
                  : 'text-slate-400 border-transparent hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action & Settings */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleExportCsv}
          className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Export Stations CSV
        </button>

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          title="Trip & Optimization Settings"
          aria-label="Open Settings"
          className="p-1.5 text-slate-400 hover:text-emerald-400 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
