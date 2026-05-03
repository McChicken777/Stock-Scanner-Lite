import { useState } from "react";
import { Lightbulb, ChevronDown, ChevronRight } from "lucide-react";

interface AiTipsPanelProps {
  context?: "template" | "quick-job" | "edit";
  defaultOpen?: boolean;
}

const TIPS_BY_CONTEXT: Record<NonNullable<AiTipsPanelProps["context"]>, string[]> = {
  template: [
    "Name what you're making and the materials (steel, aluminum, plywood, fabric…).",
    "List the production steps in order (cut → weld → sand → prime → paint).",
    "Mention sub-parts or BOM components (frame, hinges, brackets) so the AI knows to break it down.",
    "Call out which roles do the work (welder, painter, assembler) — AI will tag steps with them.",
    "Include the finishing step (powder coat, paint color, polish, packaging).",
    "Skip sales/PM chatter — focus on the physical work and quantities.",
  ],
  "quick-job": [
    "Describe the actual job: what's broken, what needs to be made, or what gets repaired.",
    "List the steps in the order you'd do them (e.g. sand → weld → prime → paint).",
    "Mention which roles are involved (welder, painter) so steps are assigned correctly.",
    "Note any finishing work (paint color, polish, drying time).",
    "Keep it focused on the shop work — skip customer or scheduling details.",
  ],
  edit: [
    "Be specific about which step to add, remove, rename, or move.",
    "Reference existing steps by name (\"after welding\", \"before painting\").",
    "If adding a step, mention the role it belongs to (welder, painter, etc.).",
    "Edits affect only this template's procedure list — sub-parts/BOM are separate.",
    "Avoid vague asks like \"make it better\" — say what should change and where.",
  ],
};

const CONTEXT_EXAMPLES: Record<NonNullable<AiTipsPanelProps["context"]>, { good: string; bad: string }> = {
  template: {
    good: "Welded steel gate, 2m wide, with CNC-cut hinges and powder coat finish. Steps: cut, weld frame, attach hinges, sand, prime, powder coat. Roles: welder, painter.",
    bad: "We have a customer who wants something nice for their front yard",
  },
  "quick-job": {
    good: "Repair a damaged steel railing — sand off rust, weld broken section, prime, paint black. Welder + painter.",
    bad: "Fix the thing for the client meeting tomorrow",
  },
  edit: {
    good: "Add a sandblasting step before painting; remove the inspection step at the end",
    bad: "Make it better and more efficient",
  },
};

export function AiTipsPanel({ context = "template", defaultOpen = false }: AiTipsPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const tips = TIPS_BY_CONTEXT[context];
  const examples = CONTEXT_EXAMPLES[context];

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-800 hover:bg-amber-100/60 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Lightbulb className="h-3.5 w-3.5" />
        <span className="text-xs font-bold uppercase tracking-wider">Tips for great AI results</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 text-xs text-amber-900 space-y-2">
          <ul className="space-y-1 list-disc list-inside">
            {tips.map((tip) => (
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
