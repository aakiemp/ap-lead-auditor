"use client";

import { useMemo, useState } from "react";

import { buildProspectBrief, type OutreachBriefData, type OutreachFinding } from "@/lib/outreach/build-prospect-brief";
import { renderProspectBriefMarkdown } from "@/lib/outreach/render-markdown";
import { renderProspectBriefPlainText } from "@/lib/outreach/render-plain-text";
import { TONE_PRESETS, type ToneId } from "@/lib/outreach/tone-presets";

type PreviewFormat = "plain" | "markdown";
type CopyStatus = "idle" | "copied" | "failed";

function defaultSelectedKeys(findings: OutreachFinding[]): Set<string> {
  const keys = new Set<string>();
  for (const finding of findings) {
    if (finding.status !== "dismissed") keys.add(finding.key);
  }
  return keys;
}

function confidenceBadgeText(confidence: OutreachFinding["confidence"]): string {
  if (confidence === "verified") return "Verified";
  if (confidence === "likely") return "Likely";
  return "Manual review";
}

export function OutreachBuilder({
  data,
  screenshotUrls,
}: {
  data: OutreachBriefData;
  screenshotUrls: Record<"mobile" | "desktop", string | null>;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => defaultSelectedKeys(data.findings));
  const [includeDismissed, setIncludeDismissed] = useState(false);
  const [toneId, setToneId] = useState<ToneId>("warm");
  const [format, setFormat] = useState<PreviewFormat>("plain");
  const [plainCopyStatus, setPlainCopyStatus] = useState<CopyStatus>("idle");
  const [markdownCopyStatus, setMarkdownCopyStatus] = useState<CopyStatus>("idle");

  const brief = useMemo(
    () => buildProspectBrief(data, { toneId, selectedKeys }),
    [data, toneId, selectedKeys],
  );

  const plainText = useMemo(() => renderProspectBriefPlainText(brief), [brief]);
  const markdown = useMemo(() => renderProspectBriefMarkdown(brief), [brief]);

  function toggleFinding(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function copy(text: string, setStatus: (status: CopyStatus) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("failed");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const verifiedFindings = data.findings.filter((f) => f.status === "verified");
  const activeFindings = data.findings.filter((f) => f.status === "active");
  const dismissedFindings = data.findings.filter((f) => f.status === "dismissed");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-medium text-zinc-900">Tone</h2>
          <div className="mt-3 flex flex-col gap-2">
            {Object.values(TONE_PRESETS).map((preset) => (
              <label key={preset.id} className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="tone"
                  checked={toneId === preset.id}
                  onChange={() => setToneId(preset.id)}
                  className="h-4 w-4"
                />
                {preset.label}
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-medium text-zinc-900">Screenshots</h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <ScreenshotThumbnail label="Mobile" url={screenshotUrls.mobile} />
            <ScreenshotThumbnail label="Desktop" url={screenshotUrls.desktop} />
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Shown here for your review only — never included as a link in the copied brief.
          </p>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-900">Findings</h2>
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={includeDismissed}
                onChange={(e) => setIncludeDismissed(e.target.checked)}
                className="h-4 w-4"
              />
              Include dismissed findings
            </label>
          </div>

          <FindingGroup
            title="Verified"
            findings={verifiedFindings}
            selectedKeys={selectedKeys}
            onToggle={toggleFinding}
          />
          <FindingGroup
            title="Active"
            findings={activeFindings}
            selectedKeys={selectedKeys}
            onToggle={toggleFinding}
          />
          {includeDismissed ? (
            <FindingGroup
              title="Dismissed"
              findings={dismissedFindings}
              selectedKeys={selectedKeys}
              onToggle={toggleFinding}
            />
          ) : null}
        </section>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormat("plain")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                format === "plain" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700"
              }`}
            >
              Plain text
            </button>
            <button
              type="button"
              onClick={() => setFormat("markdown")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                format === "markdown" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700"
              }`}
            >
              Markdown
            </button>
          </div>
          {format === "plain" ? (
            <CopyButton
              status={plainCopyStatus}
              label="Copy plain text"
              onClick={() => copy(plainText, setPlainCopyStatus)}
            />
          ) : (
            <CopyButton
              status={markdownCopyStatus}
              label="Copy markdown"
              onClick={() => copy(markdown, setMarkdownCopyStatus)}
            />
          )}
        </div>

        <pre className="max-h-[80vh] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-4 text-xs text-zinc-800">
          {format === "plain" ? plainText : markdown}
        </pre>
      </div>
    </div>
  );
}

function FindingGroup({
  title,
  findings,
  selectedKeys,
  onToggle,
}: {
  title: string;
  findings: OutreachFinding[];
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (findings.length === 0) return null;

  return (
    <div className="mt-4 first:mt-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</h3>
      <ul className="mt-2 space-y-2">
        {findings.map((finding) => (
          <li key={finding.key} className="flex items-start gap-2 rounded-md border border-zinc-200 p-2">
            <input
              type="checkbox"
              checked={selectedKeys.has(finding.key)}
              onChange={() => onToggle(finding.key)}
              className="mt-1 h-4 w-4"
            />
            <div className="flex-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-900">{finding.title}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                  {confidenceBadgeText(finding.confidence)}
                </span>
              </div>
              <p className="mt-0.5 text-zinc-600">{finding.description}</p>
              {finding.confidence === "manual_review" ? (
                <p className="mt-0.5 text-xs text-amber-600">
                  Will appear only under &quot;Items to verify manually&quot; in the brief.
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScreenshotThumbnail({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      {url ? (
        // Signed URLs are short-lived and regenerated per page load —
        // not a stable src suitable for next/image's remotePatterns
        // allowlist, and never embedded in copied text regardless.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${label} homepage screenshot`} className="mt-1 w-full rounded-md border border-zinc-200" />
      ) : (
        <div className="mt-1 flex h-24 items-center justify-center rounded-md border border-dashed border-zinc-300 text-xs text-zinc-400">
          Not captured
        </div>
      )}
    </div>
  );
}

function CopyButton({
  status,
  label,
  onClick,
}: {
  status: CopyStatus;
  label: string;
  onClick: () => void;
}) {
  const text = status === "copied" ? "Copied!" : status === "failed" ? "Copy failed — try again" : label;

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
    >
      {text}
    </button>
  );
}
