"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FaucetPhoto } from "@/lib/steps";

interface Labels {
  title: string;
  prompt: string;
  button: string;
  checking: string;
  result: Record<FaucetPhoto, string>;
  privacy: string;
  unavailable: string;
}

/** Shrink the photo in the browser (max 1024px JPEG) before sending; the server never stores it. */
async function toJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
}

export default function PhotoCheck({ homeId, current, labels }: { homeId: string; current?: FaucetPhoto; labels: Labels }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [state, setState] = useState<{ status: "idle" | "checking" | "done" | "error"; result?: FaucetPhoto }>(
    current ? { status: "done", result: current } : { status: "idle" },
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    setState({ status: "checking" });
    try {
      const image = await toJpegBase64(file);
      const res = await fetch("/api/photo-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ homeId, image }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setState({ status: "done", result: data.outdoor_faucet });
      router.refresh(); // rebuild the plan with the photo result
    } catch {
      setState({ status: "error" });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const tone = state.result === "covered" ? "text-ok" : state.result === "bare" ? "text-danger" : "text-warn";
  return (
    <section className="rounded-panel border border-border p-5">
      <h2 className="text-base font-semibold">{labels.title}</h2>
      <p className="mt-1 text-sm text-muted">{labels.prompt}</p>
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" id="faucet-photo" onChange={(e) => onFile(e.target.files?.[0])} />
      <label
        htmlFor="faucet-photo"
        className={`mt-4 flex w-full cursor-pointer items-center justify-center rounded-full border border-accent px-4 py-3 text-base font-medium text-accent transition hover:bg-accent/10 ${
          state.status === "checking" ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {state.status === "checking" ? labels.checking : labels.button}
      </label>
      {state.status === "done" && state.result && (
        <p className={`mt-3 text-sm font-medium ${tone}`} role="status">
          {labels.result[state.result]}
        </p>
      )}
      {state.status === "error" && (
        <p className="mt-3 text-sm text-danger" role="status">
          {labels.unavailable}
        </p>
      )}
      <p className="mt-3 text-xs text-muted">{labels.privacy}</p>
    </section>
  );
}
