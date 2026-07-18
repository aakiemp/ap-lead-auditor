"use client";

import { useState } from "react";

export function CopySummaryButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context). Fail
      // quietly rather than surfacing a raw browser error.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
    >
      {copied ? "Copied!" : "Copy audit for ChatGPT or Claude"}
    </button>
  );
}
