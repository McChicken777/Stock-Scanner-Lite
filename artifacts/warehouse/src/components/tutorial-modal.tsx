import { useState, useEffect } from "react";
import { useTutorial } from "@/contexts/tutorial";
import { useLang } from "@/contexts/lang";
import { TUTORIALS } from "@/data/tutorials";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Lightbulb, GraduationCap } from "lucide-react";

export function TutorialModal() {
  const { isOpen, activeKey, closeTutorial } = useTutorial();
  const { t } = useLang();
  const [step, setStep] = useState(0);

  const tutorial = activeKey ? TUTORIALS[activeKey] : null;

  // Reset to first step whenever a new tutorial opens
  useEffect(() => {
    if (isOpen) setStep(0);
  }, [isOpen, activeKey]);

  if (!tutorial) return null;

  const steps = tutorial.steps;
  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeTutorial(); }}>
      <DialogContent aria-describedby={undefined} className="w-[92vw] max-w-sm rounded-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold leading-tight">{tutorial.title}</DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{tutorial.subtitle}</p>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-5 py-4 min-h-[160px] space-y-3">
          <p className="text-sm font-bold text-foreground leading-snug">{current.heading}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{current.body}</p>

          {current.tip && (
            <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">{current.tip}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 space-y-3">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all ${
                  i === step
                    ? "w-5 h-2 bg-primary"
                    : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
              disabled={isFirst}
              className="h-9 w-9 p-0 flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {isLast ? (
              <Button
                size="sm"
                onClick={closeTutorial}
                className="flex-1 h-9 font-bold"
              >
                {t("tutorialGotIt")}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setStep((s) => s + 1)}
                className="flex-1 h-9 font-bold"
              >
                {t("tutorialNext")} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>

          {/* Skip / step counter */}
          <div className="flex items-center justify-between">
            <button
              onClick={closeTutorial}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("tutorialSkip")}
            </button>
            <span className="text-[11px] text-muted-foreground">
              {step + 1} / {steps.length}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
