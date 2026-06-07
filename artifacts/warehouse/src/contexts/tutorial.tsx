import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { getTutorialKey, type TutorialKey } from "@/data/tutorials";

interface TutorialContextValue {
  isOpen: boolean;
  activeKey: TutorialKey | null;
  openTutorial: (key?: TutorialKey) => void;
  closeTutorial: () => void;
  hasTutorial: boolean;
}

const TutorialContext = createContext<TutorialContextValue>({
  isOpen: false,
  activeKey: null,
  openTutorial: () => {},
  closeTutorial: () => {},
  hasTutorial: false,
});

export function useTutorial() {
  return useContext(TutorialContext);
}

function seenKey(userId: number, key: TutorialKey) {
  return `tutorial_v1_${userId}_${key}`;
}

function hasSeen(userId: number, key: TutorialKey): boolean {
  try {
    return localStorage.getItem(seenKey(userId, key)) === "1";
  } catch {
    return false;
  }
}

function markSeen(userId: number, key: TutorialKey) {
  try {
    localStorage.setItem(seenKey(userId, key), "1");
  } catch {}
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<TutorialKey | null>(null);
  const prevLocation = useRef<string | null>(null);

  const currentKey = getTutorialKey(location);
  const hasTutorial = currentKey !== null;

  const openTutorial = useCallback((key?: TutorialKey) => {
    const k = key ?? getTutorialKey(location);
    if (k) {
      setActiveKey(k);
      setIsOpen(true);
    }
  }, [location]);

  const closeTutorial = useCallback(() => {
    setIsOpen(false);
    if (activeKey && user?.id) {
      markSeen(user.id, activeKey);
    }
  }, [activeKey, user?.id]);

  // Auto-show on first visit to a new route
  useEffect(() => {
    if (!user?.id) return;
    if (location === prevLocation.current) return;
    prevLocation.current = location;

    const key = getTutorialKey(location);
    if (!key) return;
    if (hasSeen(user.id, key)) return;

    // Small delay so the page renders before the modal pops
    const t = setTimeout(() => {
      setActiveKey(key);
      setIsOpen(true);
    }, 600);
    return () => clearTimeout(t);
  }, [location, user?.id]);

  return (
    <TutorialContext.Provider value={{ isOpen, activeKey, openTutorial, closeTutorial, hasTutorial }}>
      {children}
    </TutorialContext.Provider>
  );
}
