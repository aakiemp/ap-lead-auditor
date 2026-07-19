"use client";

import { useState } from "react";

import { Button } from "@/components/ui";

type CopyStatus = "idle" | "copied" | "failed";

export function CopySummaryButton({ text }: { text: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      // Clipboard access can fail (permissions, insecure context) --
      // surfaced to the operator rather than failing silently, since a
      // silent failure here looks identical to a successful copy.
      setStatus("failed");
    } finally {
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  return (
    <div>
      <Button type="button" variant="primary" onClick={handleClick}>
        {status === "copied" ? "Copied!" : status === "failed" ? "Copy failed — try again" : "Copy audit for ChatGPT or Claude"}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === "copied" ? "Copied to clipboard" : status === "failed" ? "Copy failed" : ""}
      </span>
    </div>
  );
}
