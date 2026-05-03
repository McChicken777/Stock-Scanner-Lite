import { useState } from "react";
import { Lightbulb, ChevronDown, ChevronRight } from "lucide-react";

interface AiTipsPanelProps {
  context?: "template" | "quick-job" | "edit";
  defaultOpen?: boolean;
}

const COMMON_TIPS = [
  "Name what you're making and what materials are involved (steel, aluminum, plywood…).",
  "Mention key processes (welding, CNC, sandblasting, paint, assembly).",
  "Say roughly how complex it is (a single bracket vs. a 5-part frame).",
  "Skip project management chatter — focus on the physical work.",
];

const CONTEXT_TIPS: Record<NonNullable<AiTipsPanelProps["context"]>, { good: string; bad: string }> = {
  template: {
    good: "Welded steel gate, 2m wide, with CNC-cut hinges and powder coat finish",
    bad: "We have a customer who wants something nice for their front yard",
  },
  "quick-job": {
    good: "Repair a damaged steel railing — sand rust, weld broken section, repaint black",
    bad: "Fix the thing for the client meeting tomorrow",
  },
  edit: {
    good: "Add a sandblasting step before painting; remove the inspection step",
    bad: "Make it better and more efficient",
  },
};

export function AiTipsPanel({ context = "template", defaultOpen = false }: AiTipsPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const examples = CONTEXT_TIPS[context];

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-800 hover:bg-amber-100/60 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Lightbulb className="h-3.5 w-3.5" />
        <span className="text-xs font-bold uppercase tracking-wider">Tips for describing your job</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 text-xs text-amber-900 space-y-2">
          <ul className="space-y-1 list-disc list-inside">
            {COMMON_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <div className="grid grid-cols-1 gap-1.5 mt-2">
            <div className="rounded border border-green-300 bg-green-50 px-2 py-1.5">
              <p className="text-[10px] font-bold uppercase text-green-700">Good example</p>
              <p className="text-xs text-green-900 italic">"{examples.good}"</p>
            </div>
            <div className="rounded border border-red-300 bg-red-50 px-2 py-1.5">
              <p className="text-[10px] font-bold uppercase text-red-700">Too vague</p>
              <p className="text-xs text-red-900 italic">"{examples.bad}"</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
