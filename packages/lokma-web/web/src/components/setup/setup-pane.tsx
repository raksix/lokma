import * as React from 'react';
import { Check, Copy, Database, Download, Globe, HardDrive, Plug2, Search, Sparkles, Terminal, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, api, type CloudImportRes, type DoctorRes, type SetupFeatureView, type SetupInitRes } from '@/lib/api';
import {
  allOffMap,
  countPassed,
  currentMap,
  defaultMap,
  doctorCopyText,
  enabledIds,
  formatLatency,
  probeTone,
  summarizeCloudImport,
  summarizeInit,
  validateCloudFile,
} from './setup';

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

/** Presentation icons per feature id (concept parity — server sends no icons). */
const FEATURE_ICONS: Record<string, typeof Globe> = {
  browser: Globe,
  search: Search,
  gateway: Plug2,
  mcp: Plug2,
  vault: Database,
};

const CREATED_FILES = [
  '.lokma/settings.json (per-project)',
  '~/.lokma/config.json (user)',
  '~/.lokma/credentials.json (0600 AES-GCM)',
  '~/.lokma/skills/ + agents/ + vault/',
];

/**
 * SetupPane — `lokma init` + optional stack + `lokma doctor` + cloud transfer (W6-22, Docs/32, Phase 3 cloud prep).
 * Concept layout 1:1 (Init / Stack / Doctor steps), but every control is
 * live: `POST /api/setup/init` (creates the real dirs + configs),
 * `GET/POST /api/setup` (the real `features` map in `~/.lokma/config.json`),
 * `GET /api/doctor[?agents=1]` (8 real measured probes + the SOUL probe),
 * `POST /api/cloud/export` (dated state-bundle download) +
 * `POST /api/cloud/import` (restore with keep-by-default + overwrite opt-in).
 * NOT ported: the concept's hardcoded `doctorLines` (every row is measured
 * live now), the toast-only `Docs 32` button and the toast-only `Watcher`
 * button (config hot-reload is a follow-up — no dead buttons).
 */
export function SetupPane() {
  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);
  const [features, setFeatures] = React.useState<SetupFeatureView[] | null>(null);
  const [checks, setChecks] = React.useState<Record<string, boolean>>({});
  const [setupError, setSetupError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [initing, setIniting] = React.useState(false);
  const [initResult, setInitResult] = React.useState<SetupInitRes | null>(null);
  const [doctor, setDoctor] = React.useState<DoctorRes | null>(null);
  const [doctorLoading, setDoctorLoading] = React.useState(false);
  const [doctorError, setDoctorError] = React.useState<string | null>(null);
  const [withAgents, setWithAgents] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [overwrite, setOverwrite] = React.useState(false);
  const [importResult, setImportResult] = React.useState<CloudImportRes | null>(null);

  const loadSetup = React.useCallback(async () => {
    setSetupError(null);
    try {
      const res = await api.getSetup();
      setFeatures(res.features);
      setChecks(currentMap(res.features));
    } catch (e) {
      setSetupError(errMessage(e));
    }
  }, []);

  React.useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  const runDoctor = React.useCallback(async (agents: boolean) => {
    setDoctorLoading(true);
    setDoctorError(null);
    try {
      setDoctor(await api.getDoctor(agents));
    } catch (e) {
      setDoctorError(errMessage(e));
    } finally {
      setDoctorLoading(false);
    }
  }, []);

  // Doctor loads lazily on first visit to step 3 (probes are measured live).
  const openedDoctor = React.useRef(false);
  React.useEffect(() => {
    if (step === 3 && !openedDoctor.current) {
      openedDoctor.current = true;
      void runDoctor(withAgents);
    }
    // Only the step transition matters here — the toggle re-runs explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const toggleAgents = () => {
    const next = !withAgents;
    setWithAgents(next);
    void runDoctor(next);
  };

  const toggle = (id: string) => setChecks((p) => ({ ...p, [id]: !p[id] }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.saveSetupFeatures({ ...checks });
      toast(`Setup saved — ${enabledIds(res.applied).join(', ') || 'everything off'}`);
      await loadSetup();
    } catch (e) {
      toast(`Save failed — ${errMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const runInit = async () => {
    setIniting(true);
    try {
      const res = await api.initSetup();
      setInitResult(res);
      toast(`Init done — ${summarizeInit(res.created, res.existed)}`);
    } catch (e) {
      toast(`Init failed — ${errMessage(e)}`);
    } finally {
      setIniting(false);
    }
  };

  const copyDoctor = async () => {
    if (!doctor) return;
    try {
      await navigator.clipboard.writeText(doctorCopyText(doctor.checks));
      toast('Doctor output copied');
    } catch {
      toast('Copy failed — clipboard unavailable');
    }
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const { filename, blob } = await api.downloadCloudExport();
      saveBlob(filename, blob);
      toast(`State exported — ${filename}`);
    } catch (e) {
      toast(`Export failed — ${errMessage(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const runImportFile = async (file: File) => {
    const gate = validateCloudFile(file.name, file.size);
    if (gate) {
      toast(`Import blocked — ${gate}`);
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('could not read that file'));
        reader.readAsDataURL(file);
      });
      const zipBase64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
      const res = await api.importCloudState({ zipBase64, overwrite });
      setImportResult(res);
      toast(`Import done — ${summarizeCloudImport(res)}`);
    } catch (e) {
      toast(`Import failed — ${errMessage(e)}`);
    } finally {
      setImporting(false);
    }
  };

  const { passed, total } = countPassed(doctor?.checks ?? []);
  const allPass = doctor !== null && passed === total;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <HardDrive className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Setup</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">lokma init · optional stack · lokma doctor · cloud transfer</span>
        <span className="ml-auto flex gap-1">
          <Button variant={step === 1 ? 'default' : 'ghost'} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setStep(1)}>
            1 Init
          </Button>
          <Button variant={step === 2 ? 'default' : 'ghost'} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setStep(2)}>
            2 Stack
          </Button>
          <Button variant={step === 3 ? 'default' : 'ghost'} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setStep(3)}>
            3 Doctor
          </Button>
          <Button variant={step === 4 ? 'default' : 'ghost'} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setStep(4)}>
            4 Cloud
          </Button>
        </span>
      </div>

      {step === 1 && (
        <div className="flex-1 overflow-auto p-3 space-y-3 bg-[#FAF9F5]/30 dark:bg-[#0F0F11]/30">
          <div className="rounded-xl bg-[#262624] text-white p-4 border border-[#3A3A3E]">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-terracotta" /> lokma init
            </div>
            <p className="text-xs text-white/60 mt-1 leading-5">
              Pick the optional stack — the Ink TUI checkboxes, on the web. Everything is optional and can be changed later
              with <code className="px-1 py-0 rounded bg-white/10 border border-white/10">lokma setup</code>.
            </p>
            <div className="mt-3 flex gap-1.5">
              <Button size="sm" className="h-7 text-xs bg-white text-black hover:bg-white/90" onClick={() => setStep(2)}>
                Start — pick the stack →
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-white/70 hover:text-white hover:bg-white/10"
                onClick={runInit}
                disabled={initing}
              >
                {initing ? 'Initializing…' : 'Run init now'}
              </Button>
            </div>
            {initResult && (
              <div className="mt-3 rounded-lg bg-white/5 border border-white/10 p-2.5 text-xs leading-5">
                <div className="font-medium text-white">{summarizeInit(initResult.created, initResult.existed)}</div>
                {initResult.created.length > 0 && (
                  <div className="mt-1 text-emerald-300 font-mono text-[11px]">{initResult.created.join('\n')}</div>
                )}
                {initResult.existed.length > 0 && (
                  <div className="mt-1 text-white/50 font-mono text-[11px]">kept: {initResult.existed.join(', ')}</div>
                )}
              </div>
            )}
          </div>
          <div className="rounded-lg bg-white dark:bg-[#1E1E21] border border-line p-3">
            <div className="text-xs font-medium">What does it create?</div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs font-mono">
              {CREATED_FILES.map((f) => (
                <span key={f} className="px-2 py-1.5 rounded bg-muted border border-line/60">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 overflow-auto p-2 space-y-2">
          <div className="text-xs font-medium px-1">Optional stack — lokma init / lokma setup (Ink TUI checkboxes on the web)</div>
          {setupError ? (
            <div className="rounded-lg border border-line p-3 text-xs text-zinc-500">
              Could not load the feature flags — {setupError}{' '}
              <Button variant="ghost" size="sm" className="h-5 text-[11px]" onClick={() => void loadSetup()}>
                Retry
              </Button>
            </div>
          ) : features === null ? (
            <div className="rounded-lg border border-line p-3 text-xs text-zinc-500">Loading feature flags…</div>
          ) : (
            <div className="space-y-1.5">
              {features.map((o) => {
                const Icon = FEATURE_ICONS[o.id] ?? Plug2;
                const on = checks[o.id] ?? o.enabled;
                return (
                  <label
                    key={o.id}
                    className={`flex gap-2.5 p-2.5 rounded-lg border cursor-pointer transition ${on ? 'bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15] dark:border-[#3A2A1A]' : 'bg-white dark:bg-[#1E1E21] border-line hover:border-zinc-300'}`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(o.id)} className="mt-0.5 accent-[#C96442]" />
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${on ? 'text-terracotta' : 'text-zinc-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        {o.label} <span className="text-[11px] font-normal text-zinc-400">· {o.docs}</span>
                        <span className={`ml-auto w-2 h-2 rounded-full ${on ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                      </div>
                      <div className="text-xs text-zinc-500 leading-4">{o.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex gap-1">
            <Button size="sm" className="flex-1 h-7 text-xs gap-1" onClick={save} disabled={saving || features === null}>
              <Check className="w-3 h-3" /> {saving ? 'Saving…' : 'Save — lokma setup'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() => features && setChecks(allOffMap(features))}
              disabled={features === null}
            >
              Turn all off
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => features && setChecks(defaultMap(features))}
              disabled={features === null}
            >
              Reset
            </Button>
          </div>
          <div className="text-[11px] text-zinc-500 px-1">
            Saved to `~/.lokma/config.json` → `features`. Disabled features stay hidden in panes but remain in the CLI. The MCP
            list itself lives in the Settings tab.
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-auto p-2">
            <div className="rounded-lg overflow-hidden border border-line bg-[#0F0F11] text-[#EDE9E2] font-mono text-xs">
              <div className="h-7 flex items-center gap-1.5 px-3 bg-[#1E1E21] border-b border-white/10">
                <Terminal className="w-3 h-3 text-emerald-400" /> lokma doctor
                <span className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[11px] text-white/60 hover:text-white hover:bg-white/10"
                    onClick={toggleAgents}
                  >
                    {withAgents ? '✓ --agents' : '--agents'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[11px] text-white/60 hover:text-white hover:bg-white/10"
                    onClick={copyDoctor}
                    disabled={!doctor}
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                </span>
              </div>
              <div className="p-3 space-y-1 leading-5">
                {doctorError ? (
                  <div className="text-red-400">
                    Doctor failed — {doctorError}{' '}
                    <button className="underline" onClick={() => void runDoctor(withAgents)}>
                      Retry
                    </button>
                  </div>
                ) : doctor === null || doctorLoading ? (
                  <div className="text-zinc-400">Probing subsystems…</div>
                ) : (
                  doctor.checks.map((l) => (
                    <div key={l.name} className={probeTone(l.ok)}>
                      {l.ok ? '✓' : '✗'} {l.name} — {l.detail}{' '}
                      <span className="text-zinc-500">({formatLatency(l.latencyMs)})</span>
                    </div>
                  ))
                )}
                {doctor && !doctorLoading && !doctorError && (
                  <div className="pt-2 mt-2 border-t border-white/10 flex items-center gap-1 text-white">
                    <span className={`w-2 h-2 rounded-full ${allPass ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />{' '}
                    {allPass ? `All checks passed · ${passed}/${total}` : `${passed}/${total} passed — see failing rows above`}
                    <span className="ml-auto text-[11px] text-white/50">lokma doctor — layered config + subsystem probes</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="p-2 border-t border-line flex gap-1">
            <Button size="sm" className="flex-1 h-6 text-xs gap-1" onClick={() => void runDoctor(withAgents)} disabled={doctorLoading}>
              <Terminal className="w-3 h-3" /> {doctorLoading ? 'Probing…' : 'Run doctor'}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex-1 overflow-auto p-2 space-y-2">
          <div className="text-xs font-medium px-1">Cloud transfer — pack this box, unpack on the next one</div>
          <div className="rounded-lg bg-white dark:bg-[#1E1E21] border border-line p-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-terracotta" /> Export state
            </div>
            <p className="text-xs text-zinc-500 leading-5">
              Packs the portable <code className="px-1 py-0 rounded bg-muted border border-line/60">~/.lokma</code> state
              (config, memory, agents, bots, vault, archify, design, sessions, cron, plugins) into one dated{' '}
              <code className="px-1 py-0 rounded bg-muted border border-line/60">.zip</code>. Provider keys and login
              data never ride along — re-enter them on the new box.
            </p>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => void runExport()} disabled={exporting}>
              <Download className="w-3 h-3" /> {exporting ? 'Packing…' : 'Download state bundle'}
            </Button>
          </div>
          <div className="rounded-lg bg-white dark:bg-[#1E1E21] border border-line p-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-terracotta" /> Import state
            </div>
            <p className="text-xs text-zinc-500 leading-5">
              Restores a bundle a previous Export produced. Existing files are kept unless you allow replacement;
              crafted paths are rejected, and nothing is ever deleted.
            </p>
            <label htmlFor="lokma-cloud-import" className="text-xs font-medium">
              State bundle (.zip, max 64MB)
            </label>
            <input
              id="lokma-cloud-import"
              type="file"
              accept=".zip"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void runImportFile(file);
              }}
              className="block w-full text-xs text-zinc-500 file:mr-2 file:h-7 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-[#C96442] file:text-white hover:file:opacity-90 disabled:opacity-50"
            />
            <label className="flex gap-2 items-center text-xs text-zinc-500 cursor-pointer">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={() => setOverwrite((v) => !v)}
                className="accent-[#C96442]"
              />
              Replace files that already exist
            </label>
            {importing && <div className="text-xs text-zinc-500">Restoring bundle…</div>}
            {importResult && (
              <div className="rounded-lg bg-muted border border-line/60 p-2.5 text-xs leading-5">
                <div className="font-medium">{summarizeCloudImport(importResult)}</div>
                {importResult.rejected.length > 0 && (
                  <div className="mt-1 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                    {importResult.rejected.map((r) => `${r.path} (${r.reason})`).join('\n')}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="text-[11px] text-zinc-500 px-1">
            Secrets stay home: `credentials.json` + `auth/` are excluded and rejected. Per-project `.lokma/` travels
            with the project checkout. Derived search indexes rebuild on demand.
          </div>
        </div>
      )}
    </div>
  );
}
