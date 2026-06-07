import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronRight, ChevronDown, Plus, Trash2, Save, Settings2, Loader2,
  AlertTriangle, Check, Info, X, ArrowLeft, Zap, Copy,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StationType { id: number; name: string; color: string; flowOrder: number; }

interface OutlineOpCode { stationTypeId: number; stationTypeName: string; }
interface OutlineConditionalExclusion { excludeCode: string; ifHasCode: string; }
interface OutlineSettings {
  opCodes: Record<string, OutlineOpCode>;
  defaultOpCodes: string[];
  conditionalExclusions: OutlineConditionalExclusion[];
  profiles: Record<string, string[]>;
}

const EMPTY_SETTINGS: OutlineSettings = {
  opCodes: {}, defaultOpCodes: [], conditionalExclusions: [], profiles: {},
};

interface ParsedLine {
  lineIndex: number;
  depth: number;
  name: string;
  quantity: number;
  rawOpTokens: string[];
  isDitto: boolean;
}

interface TreeNode {
  lineIndex: number;
  name: string;
  quantity: number;
  depth: number;
  resolvedOps: string[];         // op codes (short codes) in final set
  resolvedStationTypeIds: number[];
  negOps: Set<string>;
  children: TreeNode[];
  warnings: string[];
}

interface ParseResult {
  roots: TreeNode[];
  partCount: number;
  assemblyCount: number;
  warnings: { lineIndex: number; message: string }[];
}

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseLine(raw: string): ParsedLine | null {
  if (!raw.trim()) return null;

  // Normalize tabs → 2 spaces for depth calculation
  const normalized = raw.replace(/\t/g, "  ");
  const spaces = normalized.length - normalized.trimStart().length;
  const depth = Math.floor(spaces / 2);

  const content = raw.trimStart();

  // Split name from ops: tab character OR 3+ spaces after non-space content
  let name = content;
  let rawOpsStr = "";

  const tabIdx = content.indexOf("\t");
  if (tabIdx !== -1) {
    name = content.substring(0, tabIdx).trimEnd();
    rawOpsStr = content.substring(tabIdx + 1).trim();
  } else {
    const match = content.match(/^(.*?)\s{3,}(\S.*)$/);
    if (match) {
      name = match[1].trimEnd();
      rawOpsStr = match[2].trim();
    }
  }

  // Parse quantity: ×N or xN at end of name
  let quantity = 1;
  const qMatch = name.match(/^(.*?)\s*[×x](\d+)\s*$/);
  if (qMatch) {
    name = qMatch[1].trimEnd();
    quantity = Math.max(1, parseInt(qMatch[2], 10));
  }

  const rawOpTokens = rawOpsStr ? rawOpsStr.split(/\s+/).filter(Boolean) : [];
  const isDitto = rawOpTokens.length === 1 && rawOpTokens[0] === "=";

  return {
    lineIndex: 0, // will be set by caller
    depth,
    name: name.trim(),
    quantity,
    rawOpTokens,
    isDitto,
  };
}

function buildTree(lines: ParsedLine[], settings: OutlineSettings): ParseResult {
  if (lines.length === 0) return { roots: [], partCount: 0, assemblyCount: 0, warnings: [] };

  const globalWarnings: { lineIndex: number; message: string }[] = [];

  // Build raw tree from indentation
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = []; // stack[i] = ancestor at depth i

  // Resolve ditto: for each line, find the previous sibling (same depth, previous)
  // We track last-seen raw ops per depth
  const lastOpsByDepth = new Map<number, string[]>();

  for (const line of lines) {
    // Resolve ditto
    let opTokens = line.rawOpTokens;
    if (line.isDitto) {
      opTokens = lastOpsByDepth.get(line.depth) ?? [];
    } else if (opTokens.length > 0 && !line.isDitto) {
      // Only update lastOps if not ditto and has ops
      lastOpsByDepth.set(line.depth, opTokens);
    }

    // Parse pos/neg ops and expand @profiles
    const posOps: string[] = [];
    const negOps = new Set<string>();
    const lineWarnings: string[] = [];

    for (const token of opTokens) {
      if (token === "=") continue;
      if (token.startsWith("-")) {
        const code = token.slice(1);
        negOps.add(code);
      } else if (token.startsWith("@")) {
        const profile = settings.profiles[token];
        if (profile) {
          posOps.push(...profile);
        } else {
          lineWarnings.push(`Unknown profile: "${token}"`);
        }
      } else {
        posOps.push(token);
        if (!(token in settings.opCodes)) {
          lineWarnings.push(`Unknown op code: "${token}"`);
        }
      }
    }

    const node: TreeNode = {
      lineIndex: line.lineIndex,
      name: line.name,
      quantity: line.quantity,
      depth: line.depth,
      resolvedOps: [],
      resolvedStationTypeIds: [],
      negOps,
      children: [],
      warnings: lineWarnings,
    };
    // Store raw pos ops temporarily
    (node as TreeNode & { _posOps: string[] })._posOps = posOps;

    // Trim stack to current depth
    while (stack.length > line.depth) stack.pop();

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);

    for (const w of lineWarnings) globalWarnings.push({ lineIndex: line.lineIndex, message: w });
  }

  // Second pass: resolve final ops (apply defaults, parent inheritance, conditional exclusions)
  let partCount = 0;
  let assemblyCount = 0;

  function resolveNode(node: TreeNode & { _posOps?: string[] }, inheritedNegOps: Set<string>) {
    const effectiveNeg = new Set<string>([...inheritedNegOps, ...node.negOps]);
    const isLeaf = node.children.length === 0;

    if (isLeaf) {
      partCount++;
      const ops = new Set<string>(node._posOps ?? []);

      // Add defaults unless negated
      for (const def of settings.defaultOpCodes) {
        if (!effectiveNeg.has(def)) ops.add(def);
      }

      // Apply conditional exclusions
      for (const exc of settings.conditionalExclusions) {
        if (ops.has(exc.ifHasCode)) ops.delete(exc.excludeCode);
      }

      // Remove explicitly negated ops
      for (const neg of effectiveNeg) ops.delete(neg);

      node.resolvedOps = Array.from(ops);
      node.resolvedStationTypeIds = node.resolvedOps
        .map((code) => settings.opCodes[code]?.stationTypeId)
        .filter((id): id is number => id !== undefined);
    } else {
      assemblyCount++;
      // Assembly nodes: if they have their own posOps, assign them (they are steps for this assembly)
      const posOps = node._posOps ?? [];
      if (posOps.length > 0) {
        const ops = new Set<string>(posOps);
        for (const exc of settings.conditionalExclusions) {
          if (ops.has(exc.ifHasCode)) ops.delete(exc.excludeCode);
        }
        for (const neg of effectiveNeg) ops.delete(neg);
        node.resolvedOps = Array.from(ops);
        node.resolvedStationTypeIds = node.resolvedOps
          .map((code) => settings.opCodes[code]?.stationTypeId)
          .filter((id): id is number => id !== undefined);
      }
    }

    delete (node as TreeNode & { _posOps?: string[] })._posOps;
    for (const child of node.children) resolveNode(child as TreeNode & { _posOps?: string[] }, effectiveNeg);
  }

  for (const root of roots) resolveNode(root as TreeNode & { _posOps?: string[] }, new Set());

  return { roots, partCount, assemblyCount, warnings: globalWarnings };
}

function parseOutline(text: string, settings: OutlineSettings): ParseResult {
  const rawLines = text.split("\n");
  const parsed: ParsedLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = parseLine(rawLines[i]);
    if (line) {
      line.lineIndex = i;
      parsed.push(line);
    }
  }
  return buildTree(parsed, settings);
}

// Convert tree to API payload
interface ImportPayload {
  templateName: string;
  rootOps: string[];
  rootStationTypeIds: number[];
  children: ImportPart[];
}
interface ImportPart {
  name: string;
  quantity: number;
  ops: string[];
  stationTypeIds: number[];
  children: ImportPart[];
}

function treeToPayload(templateName: string, roots: TreeNode[], settings: OutlineSettings): ImportPayload {
  function convertNode(node: TreeNode): ImportPart {
    return {
      name: node.name,
      quantity: node.quantity,
      ops: node.resolvedOps.map((code) => settings.opCodes[code]?.stationTypeName ?? code),
      stationTypeIds: node.resolvedStationTypeIds,
      children: node.children.map(convertNode),
    };
  }

  // If there's a single root and no explicit root ops, treat it as the template name node
  if (roots.length === 1 && roots[0].children.length > 0) {
    const root = roots[0];
    return {
      templateName: root.name || templateName,
      rootOps: root.resolvedOps.map((code) => settings.opCodes[code]?.stationTypeName ?? code),
      rootStationTypeIds: root.resolvedStationTypeIds,
      children: root.children.map(convertNode),
    };
  }

  return {
    templateName,
    rootOps: [],
    rootStationTypeIds: [],
    children: roots.map(convertNode),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Request failed");
  }
  return res.json();
}

// ─── Op Badge ────────────────────────────────────────────────────────────────

function OpBadge({ code, settings, isDefault }: { code: string; settings: OutlineSettings; isDefault?: boolean }) {
  const info = settings.opCodes[code];
  const color = info ? "#6366f1" : "#94a3b8";
  return (
    <span
      style={{ backgroundColor: color + "22", color, borderColor: color + "55" }}
      className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border ${isDefault ? "opacity-50" : ""}`}
    >
      {code}{isDefault && " *"}
    </span>
  );
}

// ─── Tree Preview Node ────────────────────────────────────────────────────────

function PreviewNode({ node, settings, depth }: { node: TreeNode; settings: OutlineSettings; depth: number }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const defaultSet = new Set(settings.defaultOpCodes);

  return (
    <div style={{ marginLeft: depth * 16 }} className="select-none">
      <div
        className={`flex items-start gap-1.5 py-0.5 px-1 rounded hover:bg-muted/40 group ${node.warnings.length ? "bg-yellow-50" : ""}`}
        onClick={() => hasChildren && setOpen((v) => !v)}
        role={hasChildren ? "button" : undefined}
        style={{ cursor: hasChildren ? "pointer" : "default" }}
      >
        <span className="mt-0.5 flex-shrink-0 w-3.5">
          {hasChildren ? (
            open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : (
            <span className="inline-block h-3 w-3 rounded-full border border-muted-foreground/30 mt-0.5" />
          )}
        </span>
        <span className={`text-sm font-medium flex-1 min-w-0 truncate ${hasChildren ? "text-blue-700" : "text-foreground"}`}>
          {node.name}
          {node.quantity > 1 && <span className="ml-1 text-xs text-muted-foreground font-normal">×{node.quantity}</span>}
        </span>
        <div className="flex flex-wrap gap-0.5 flex-shrink-0">
          {/* Show resolved ops: non-defaults bold, defaults faded */}
          {node.resolvedOps.map((code) => (
            <OpBadge key={code} code={code} settings={settings} isDefault={defaultSet.has(code)} />
          ))}
        </div>
        {node.warnings.length > 0 && (
          <span title={node.warnings.join("; ")}><AlertTriangle className="h-3 w-3 text-yellow-500 flex-shrink-0" /></span>
        )}
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((child, i) => (
            <PreviewNode key={i} node={child} settings={settings} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Op Code Setup Panel ──────────────────────────────────────────────────────

function OpSetupPanel({
  settings, stationTypes, onChange,
}: {
  settings: OutlineSettings;
  stationTypes: StationType[];
  onChange: (s: OutlineSettings) => void;
}) {
  const [newCode, setNewCode] = useState("");
  const [newCodeSt, setNewCodeSt] = useState<number | "">("");
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileOps, setNewProfileOps] = useState("");
  const [newExclFrom, setNewExclFrom] = useState("");
  const [newExclIf, setNewExclIf] = useState("");

  const addOpCode = () => {
    if (!newCode.trim() || !newCodeSt) return;
    const stType = stationTypes.find((s) => s.id === newCodeSt);
    if (!stType) return;
    onChange({
      ...settings,
      opCodes: {
        ...settings.opCodes,
        [newCode.trim().toLowerCase()]: { stationTypeId: stType.id, stationTypeName: stType.name },
      },
    });
    setNewCode("");
    setNewCodeSt("");
  };

  const removeOpCode = (code: string) => {
    const next = { ...settings.opCodes };
    delete next[code];
    onChange({ ...settings, opCodes: next });
  };

  const toggleDefault = (code: string) => {
    const defaults = settings.defaultOpCodes.includes(code)
      ? settings.defaultOpCodes.filter((c) => c !== code)
      : [...settings.defaultOpCodes, code];
    onChange({ ...settings, defaultOpCodes: defaults });
  };

  const addProfile = () => {
    if (!newProfileName.trim() || !newProfileOps.trim()) return;
    const key = newProfileName.startsWith("@") ? newProfileName : `@${newProfileName}`;
    const ops = newProfileOps.split(/[\s,]+/).filter(Boolean);
    onChange({ ...settings, profiles: { ...settings.profiles, [key]: ops } });
    setNewProfileName("");
    setNewProfileOps("");
  };

  const removeProfile = (key: string) => {
    const next = { ...settings.profiles };
    delete next[key];
    onChange({ ...settings, profiles: next });
  };

  const addExclusion = () => {
    if (!newExclFrom.trim() || !newExclIf.trim()) return;
    onChange({
      ...settings,
      conditionalExclusions: [
        ...settings.conditionalExclusions,
        { excludeCode: newExclFrom.trim(), ifHasCode: newExclIf.trim() },
      ],
    });
    setNewExclFrom("");
    setNewExclIf("");
  };

  const removeExclusion = (i: number) => {
    onChange({ ...settings, conditionalExclusions: settings.conditionalExclusions.filter((_, idx) => idx !== i) });
  };

  const codes = Object.keys(settings.opCodes);

  return (
    <div className="space-y-4 text-sm">
      {/* Op Codes */}
      <div>
        <p className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-2">Operation Short Codes</p>
        <p className="text-xs text-muted-foreground mb-2">Define short codes to use in the editor. Mark as default to apply automatically to every part.</p>
        {codes.length > 0 && (
          <div className="space-y-1 mb-2">
            {codes.map((code) => {
              const info = settings.opCodes[code];
              const isDef = settings.defaultOpCodes.includes(code);
              return (
                <div key={code} className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1">
                  <code className="font-mono text-xs font-bold w-10 flex-shrink-0">{code}</code>
                  <span className="text-xs flex-1">{info.stationTypeName}</span>
                  <button
                    onClick={() => toggleDefault(code)}
                    className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${isDef ? "bg-green-100 text-green-700 border-green-300" : "border-border text-muted-foreground hover:bg-muted"}`}
                    title={isDef ? "Default (click to remove)" : "Not default (click to make default)"}
                  >
                    {isDef ? "default ✓" : "default?"}
                  </button>
                  <button onClick={() => removeOpCode(code)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-1.5 items-center flex-wrap">
          <Input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/\s/g, ""))}
            placeholder="code (e.g. lc)"
            className="h-7 text-xs font-mono w-20"
            onKeyDown={(e) => { if (e.key === "Enter") addOpCode(); }}
          />
          <select
            value={newCodeSt}
            onChange={(e) => setNewCodeSt(e.target.value ? Number(e.target.value) : "")}
            className="h-7 text-xs rounded border border-border bg-background px-1.5 flex-1 min-w-[120px]"
          >
            <option value="">→ station type</option>
            {stationTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button size="sm" className="h-7 text-xs px-2" onClick={addOpCode} disabled={!newCode.trim() || !newCodeSt}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {stationTypes.length === 0 && (
          <p className="text-xs text-yellow-600 mt-1">⚠ No station types defined yet. Go to Production Flow in settings first.</p>
        )}
      </div>

      {/* Conditional Exclusions */}
      <div>
        <p className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-2">Conditional Exclusions</p>
        <p className="text-xs text-muted-foreground mb-2">e.g. "exclude <b>sb</b> if part has <b>cnc</b>" — CNC parts skip sandblasting automatically.</p>
        {settings.conditionalExclusions.map((exc, i) => (
          <div key={i} className="flex items-center gap-1 bg-muted/40 rounded px-2 py-1 mb-1 text-xs">
            <span>Exclude <code className="font-mono font-bold">{exc.excludeCode}</code> if has <code className="font-mono font-bold">{exc.ifHasCode}</code></span>
            <button onClick={() => removeExclusion(i)} className="ml-auto text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
          </div>
        ))}
        <div className="flex gap-1.5 items-center flex-wrap mt-1">
          <span className="text-xs text-muted-foreground">Exclude</span>
          <Input value={newExclFrom} onChange={(e) => setNewExclFrom(e.target.value)} placeholder="sb" className="h-7 text-xs font-mono w-16" />
          <span className="text-xs text-muted-foreground">if has</span>
          <Input value={newExclIf} onChange={(e) => setNewExclIf(e.target.value)} placeholder="cnc" className="h-7 text-xs font-mono w-16" />
          <Button size="sm" className="h-7 text-xs px-2" onClick={addExclusion} disabled={!newExclFrom.trim() || !newExclIf.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Profiles */}
      <div>
        <p className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-2">Part Profiles</p>
        <p className="text-xs text-muted-foreground mb-2">Shorthand for common op combinations. Type <code className="font-mono">@name</code> in the editor.</p>
        {Object.entries(settings.profiles).map(([key, ops]) => (
          <div key={key} className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1 mb-1 text-xs">
            <code className="font-mono font-bold text-purple-700">{key}</code>
            <span className="text-muted-foreground">→</span>
            <span>{ops.join(", ")}</span>
            <button onClick={() => removeProfile(key)} className="ml-auto text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
          </div>
        ))}
        <div className="flex gap-1.5 items-center flex-wrap mt-1">
          <Input value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} placeholder="@uv" className="h-7 text-xs font-mono w-20" />
          <Input value={newProfileOps} onChange={(e) => setNewProfileOps(e.target.value)} placeholder="lc up" className="h-7 text-xs flex-1 min-w-[100px]" />
          <Button size="sm" className="h-7 text-xs px-2" onClick={addProfile} disabled={!newProfileName.trim() || !newProfileOps.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Keyboard reference overlay ───────────────────────────────────────────────

const KEYBOARD_HINTS = [
  { key: "Tab (at line start)", desc: "Indent (make child)" },
  { key: "Shift+Tab", desc: "Dedent (go up a level)" },
  { key: "Tab (after name)", desc: "Jump to ops field" },
  { key: "Enter", desc: "New sibling below" },
  { key: "= in ops", desc: "Copy ops from line above" },
  { key: "×N / xN in name", desc: "Set quantity (e.g. gred ×4)" },
  { key: "-op in ops", desc: "Exclude default op (e.g. -lak)" },
  { key: "@profile in ops", desc: "Expand a saved profile" },
  { key: "Parent -op", desc: "Children inherit the exclusion" },
];

// ─── Main Editor Page ─────────────────────────────────────────────────────────

export default function TemplateOutlinePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [text, setText] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [settings, setSettings] = useState<OutlineSettings>(EMPTY_SETTINGS);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult>({ roots: [], partCount: 0, assemblyCount: 0, warnings: [] });

  // Load station types
  const { data: stationTypes = [] } = useQuery<StationType[]>({
    queryKey: ["/api/stations/types"],
    queryFn: () => apiFetch("/api/stations/types"),
  });

  // Load saved outline settings
  const { data: savedSettings } = useQuery<OutlineSettings>({
    queryKey: ["/api/settings/outline"],
    queryFn: () => apiFetch("/api/settings/outline"),
  });

  useEffect(() => {
    if (savedSettings) setSettings(savedSettings);
  }, [savedSettings]);

  // Debounced parse on text or settings change
  const triggerParse = useCallback((t: string, s: OutlineSettings) => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    parseTimerRef.current = setTimeout(() => {
      setParseResult(parseOutline(t, s));
    }, 120);
  }, []);

  useEffect(() => { triggerParse(text, settings); }, [text, settings, triggerParse]);

  // Save settings mutation
  const saveSettings = useMutation({
    mutationFn: (s: OutlineSettings) => apiFetch("/api/settings/outline", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings/outline"] });
      setSettingsDirty(false);
      toast({ title: "Settings saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSettingsChange = (s: OutlineSettings) => {
    setSettings(s);
    setSettingsDirty(true);
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (payload: ImportPayload) => apiFetch("/api/work/templates/outline-import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    onSuccess: (data: { templateId: number; templateName: string; partCount: number }) => {
      qc.invalidateQueries({ queryKey: ["/api/work/templates"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: `Template "${data.templateName}" created with ${data.partCount} parts!` });
      navigate("/work/templates");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    if (!text.trim()) { toast({ title: "Outline is empty", variant: "destructive" }); return; }
    const name = templateName.trim() || (parseResult.roots[0]?.name ?? "Template");
    const payload = treeToPayload(name, parseResult.roots, settings);
    if (!payload.templateName.trim()) { toast({ title: "Template name required", variant: "destructive" }); return; }
    importMutation.mutate(payload);
  };

  // ── Smart keyboard handler ──────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const { selectionStart, selectionEnd } = ta;
    const val = ta.value;
    const lines = val.split("\n");

    // Find current line index and positions
    let lineStart = 0;
    let curLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = lineStart + lines[i].length;
      if (selectionStart <= lineEnd || i === lines.length - 1) { curLine = i; break; }
      lineStart += lines[i].length + 1;
    }
    const currentLineText = lines[curLine] ?? "";
    const lineStartPos = lines.slice(0, curLine).reduce((a, l) => a + l.length + 1, 0);
    const lineEndPos = lineStartPos + currentLineText.length;

    const cursorPosInLine = selectionStart - lineStartPos;
    const trimmed = currentLineText.trimStart();
    const leadingSpaces = currentLineText.length - trimmed.length;

    if (e.key === "Tab") {
      e.preventDefault();

      if (e.shiftKey) {
        // Dedent: remove 2 spaces from start
        if (currentLineText.startsWith("  ")) {
          const newLine = currentLineText.slice(2);
          const newVal = val.slice(0, lineStartPos) + newLine + val.slice(lineEndPos);
          ta.value = newVal;
          const newPos = Math.max(lineStartPos, selectionStart - 2);
          ta.setSelectionRange(newPos, newPos);
          setText(newVal);
        }
        return;
      }

      // Check whether cursor is in the "name" area (before any tab separator)
      const tabInContent = trimmed.indexOf("\t");
      const opsSeparatorPos = tabInContent !== -1 ? leadingSpaces + tabInContent : -1;
      const isInNameArea = opsSeparatorPos === -1 || cursorPosInLine <= opsSeparatorPos;

      if (isInNameArea && (trimmed === "" || cursorPosInLine <= leadingSpaces + (tabInContent !== -1 ? tabInContent : trimmed.length))) {
        // Indent: add 2 spaces at start
        const newLine = "  " + currentLineText;
        const newVal = val.slice(0, lineStartPos) + newLine + val.slice(lineEndPos);
        ta.value = newVal;
        const newPos = selectionStart + 2;
        ta.setSelectionRange(newPos, newPos);
        setText(newVal);
      } else {
        // Jump to / create ops field (add tab after name if not present)
        if (tabInContent === -1) {
          const nameEnd = lineStartPos + leadingSpaces + trimmed.length;
          const newVal = val.slice(0, nameEnd) + "\t" + val.slice(nameEnd);
          ta.value = newVal;
          ta.setSelectionRange(nameEnd + 1, nameEnd + 1);
          setText(newVal);
        } else {
          const opsStart = lineStartPos + leadingSpaces + tabInContent + 1;
          ta.setSelectionRange(opsStart, opsStart);
        }
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const indentSpaces = " ".repeat(leadingSpaces);
      const insertion = "\n" + indentSpaces;
      const newVal = val.slice(0, selectionStart) + insertion + val.slice(selectionEnd);
      ta.value = newVal;
      const newPos = selectionStart + insertion.length;
      ta.setSelectionRange(newPos, newPos);
      setText(newVal);
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  }, []);

  const loadExample = () => {
    const codes = Object.keys(settings.opCodes);
    const [c1 = "op1", c2 = "op2", c3 = "op3"] = codes;
    const example = `Roll Cage
  Front Mount
    Plošča 20mm\t${c1} ${c2} ${c3}
    Plošča 15mm\t=
    Plošča 10mm\t${c1} ${c3}
    Plošča 6mm ×2\t${c1}
  Rear Mount
    Plošča 20mm\t${c1} ${c2}
    Gred ×4\t${c3}`;
    setText(example);
    if (!templateName) setTemplateName("Roll Cage");
  };

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>Admin only</p></div>;
  }

  const hasUnknownOps = parseResult.warnings.length > 0;
  const codesConfigured = Object.keys(settings.opCodes).length > 0;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-card flex-shrink-0">
        <button
          onClick={() => navigate("/work/templates")}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="font-bold text-base">Outline Import</div>
        <div className="flex items-center gap-1.5 ml-2">
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder={parseResult.roots[0]?.name || "Template name…"}
            className="h-8 text-sm border-2 w-52"
          />
        </div>
        <div className="flex-1" />

        {/* Stats */}
        {text.trim() && (
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            <span>{parseResult.partCount} parts</span>
            <span>{parseResult.assemblyCount} assemblies</span>
            {hasUnknownOps && (
              <span className="text-yellow-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {parseResult.warnings.length} warnings
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => setShowHints((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
        >
          ? Keys
        </button>
        <button
          onClick={() => setShowSetup((v) => !v)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${showSetup ? "bg-blue-50 border-blue-300 text-blue-700" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Setup
          {!codesConfigured && <span className="text-yellow-500">!</span>}
        </button>
        <Button
          size="sm"
          className="h-8 gap-1 font-bold"
          disabled={!text.trim() || importMutation.isPending}
          onClick={handleCreate}
        >
          {importMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Create Template
        </Button>
      </div>

      {/* Keyboard hints bar */}
      {showHints && (
        <div className="border-b bg-slate-50 px-4 py-2 flex-shrink-0">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {KEYBOARD_HINTS.map((h) => (
              <span key={h.key} className="text-xs">
                <kbd className="font-mono bg-white border border-border rounded px-1 py-0.5 text-[10px]">{h.key}</kbd>
                <span className="ml-1 text-muted-foreground">{h.desc}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Setup panel (full width, collapsible) */}
      {showSetup && (
        <div className="border-b bg-slate-50 px-4 py-3 flex-shrink-0 overflow-y-auto max-h-[40vh]">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-sm">Op Code Setup</span>
            <div className="flex items-center gap-2">
              {settingsDirty && (
                <Button
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={saveSettings.isPending}
                  onClick={() => saveSettings.mutate(settings)}
                >
                  {saveSettings.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save settings
                </Button>
              )}
              <button onClick={() => setShowSetup(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <OpSetupPanel settings={settings} stationTypes={stationTypes} onChange={handleSettingsChange} />
        </div>
      )}

      {/* Main body: editor + preview */}
      <div className="flex flex-1 min-h-0">
        {/* Editor side */}
        <div className="flex-1 flex flex-col min-w-0 border-r">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/20 flex-shrink-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Outline</span>
            <div className="flex items-center gap-2">
              {!codesConfigured && (
                <button
                  onClick={() => setShowSetup(true)}
                  className="text-xs text-yellow-600 hover:text-yellow-800 flex items-center gap-1"
                >
                  <AlertTriangle className="h-3 w-3" /> Set up op codes first
                </button>
              )}
              {text.trim() === "" && (
                <button
                  onClick={loadExample}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" /> Load example
                </button>
              )}
            </div>
          </div>

          <textarea
            ref={taRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="flex-1 resize-none font-mono text-sm p-3 bg-background outline-none border-none focus:ring-0 leading-6"
            placeholder={`Roll Cage
  Front Mount
    Plate 20mm\tlc up var
    Plate 15mm\t=
    Plate 10mm\tlc cnc
  Rear Mount
    Plate 20mm\tlc up var
    Rod ×4\tcnc`}
            style={{ tabSize: 4 }}
          />

          {/* Inline warning list at bottom of editor */}
          {hasUnknownOps && (
            <div className="border-t bg-yellow-50 px-3 py-2 max-h-24 overflow-y-auto flex-shrink-0">
              {parseResult.warnings.slice(0, 5).map((w, i) => (
                <p key={i} className="text-xs text-yellow-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                  Line {w.lineIndex + 1}: {w.message}
                </p>
              ))}
              {parseResult.warnings.length > 5 && (
                <p className="text-xs text-yellow-600">…and {parseResult.warnings.length - 5} more</p>
              )}
            </div>
          )}
        </div>

        {/* Preview side */}
        <div className="w-[44%] flex flex-col min-w-0 bg-card">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/20 flex-shrink-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Preview</span>
            {text.trim() && (
              <span className="text-xs text-muted-foreground">
                {parseResult.partCount} parts · {parseResult.assemblyCount} assemblies
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {!text.trim() ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                <Info className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Start typing on the left</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Indent with Tab, ops after second Tab or 3+ spaces.
                    {Object.keys(settings.defaultOpCodes).length > 0 && (
                      <> Defaults ({settings.defaultOpCodes.join(", ")}) shown faded.</>
                    )}
                  </p>
                </div>
                {codesConfigured && (
                  <div className="mt-2 text-xs text-muted-foreground border border-border rounded-lg p-3 text-left w-full">
                    <p className="font-semibold mb-1.5">Your op codes:</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(settings.opCodes).map(([code, info]) => (
                        <span key={code} className="flex items-center gap-1 bg-muted rounded px-1.5 py-0.5">
                          <code className="font-mono font-bold text-xs">{code}</code>
                          <span className="text-xs text-muted-foreground">{info.stationTypeName}</span>
                          {settings.defaultOpCodes.includes(code) && <span className="text-[10px] text-green-600">default</span>}
                        </span>
                      ))}
                    </div>
                    {Object.keys(settings.profiles).length > 0 && (
                      <>
                        <p className="font-semibold mt-2 mb-1">Profiles:</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(settings.profiles).map(([key, ops]) => (
                            <span key={key} className="bg-purple-50 text-purple-700 text-xs rounded px-1.5 py-0.5 font-mono">{key} = {ops.join(" ")}</span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : parseResult.roots.length === 0 ? (
              <p className="text-sm text-muted-foreground italic p-3">Nothing to preview yet…</p>
            ) : (
              <div>
                {parseResult.roots.map((root, i) => (
                  <PreviewNode key={i} node={root} settings={settings} depth={0} />
                ))}
              </div>
            )}
          </div>

          {/* Scope summary footer */}
          {text.trim() && parseResult.partCount > 0 && (
            <div className="border-t px-3 py-2 flex-shrink-0 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex gap-3 text-xs">
                  <span className="text-muted-foreground">{parseResult.partCount} leaf parts</span>
                  {parseResult.assemblyCount > 0 && <span className="text-muted-foreground">{parseResult.assemblyCount} assemblies</span>}
                  {hasUnknownOps && <span className="text-yellow-600">{parseResult.warnings.length} warnings</span>}
                </div>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 font-bold"
                  disabled={!text.trim() || importMutation.isPending}
                  onClick={handleCreate}
                >
                  {importMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Create
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
