// Simple line icons for each kind of step (homeowner pages).

const PATHS: Record<string, string> = {
  drip: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z",
  no_drip: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11ZM4 4l16 16",
  vent: "M4 6h16v12H4zM4 10h16M4 14h16",
  cabinet: "M4 4h16v16H4zM12 4v16M9 11v2M15 11v2",
  heat: "M14 14.76V3.5a2 2 0 1 0-4 0v11.26a4 4 0 1 0 4 0Z",
  faucet: "M4 9h8a3 3 0 0 1 3 3v2M15 14v3M8 9V6M5 6h6M3 20h18",
  hose: "M4 12c0-4 3-7 8-7s8 3 8 7-3 7-8 7M12 19c-2 0-4-1-4-3s2-3 4-3",
  valve: "M12 3v4M8 7h8M12 7v6M5 13h14v4H5z",
};

const KEY_TO_ICON: Record<string, string> = {
  drip_kitchen: "drip",
  drip_bathroom: "drip",
  drip_farthest: "drip",
  no_drip_uncovered: "no_drip",
  no_drip_watch: "no_drip",
  no_drip_low: "no_drip",
  crawlspace_vents: "vent",
  kitchen_cabinet: "cabinet",
  bathroom_cabinets: "cabinet",
  heat_55: "heat",
  heat_on: "heat",
  cover_faucet_one: "faucet",
  cover_faucet_two: "faucet",
  cover_faucet_many: "faucet",
  shutoff_drain_faucet: "valve",
  unhook_hoses: "hose",
  shutoff_valve: "valve",
};

export default function StepIcon({ stepKey, className = "size-6" }: { stepKey: string; className?: string }) {
  const d = PATHS[KEY_TO_ICON[stepKey] ?? "valve"];
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
