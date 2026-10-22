"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorState, Loading, retryTerminal } from "@/components/terminal/widget-kit";
import { terminalApi } from "@/lib/terminal";

/** Official live streams only: each broadcaster's own YouTube channel through YouTube's
 * embed player (no hotlinked CDNs, no restreams). The player itself shows "offline"
 * when a channel is not live. Channels are configurable (TERMINAL_TV_CHANNELS). */
export default function TvWidget() {
  const q = useQuery({ retry: retryTerminal, queryKey: ["terminal", "status"], queryFn: terminalApi.status, staleTime: 3_600_000 });
  const [index, setIndex] = useState(0);
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  const channels = q.data!.tv_channels;
  const ch = channels[Math.min(index, channels.length - 1)];
  if (!ch) return <p className="p-3 text-xs text-[#808495]">No channels configured.</p>;
  const src = `https://www.youtube-nocookie.com/embed/live_stream?channel=${encodeURIComponent(ch.youtube_channel_id)}&autoplay=0&mute=1`;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-white/[0.04] px-2 py-1">
        {channels.map((c, i) => (
          <button
            key={c.youtube_channel_id}
            type="button"
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
            className={`rounded px-2 py-0.5 text-[10.5px] ${i === index ? "bg-white/[0.1] text-[#F5F5F7]" : "text-[#808495] hover:text-[#D4D5DB]"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 bg-black">
        <iframe
          key={src}
          title={`${ch.label} live`}
          src={src}
          className="h-full w-full"
          allow="encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
      <footer className="border-t border-white/[0.05] px-2 py-1 font-mono text-[9.5px] text-[#666A76]">
        {ch.label}&apos;s official YouTube live stream · shows offline when the channel is not broadcasting
      </footer>
    </div>
  );
}
