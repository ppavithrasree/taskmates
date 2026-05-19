import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { useLocation } from "react-router-dom";
import { Bot, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import { AI_NAME, AI_STORAGE_KEYS } from "./constants";
import { buildAiContext } from "./actions";
import { askGemini } from "./geminiService";
import { loadGeminiKey, loadProcessedMentions, saveProcessedMentions } from "./storage";
import { useAiSettings } from "./useAiSettings";

const AiChat = lazy(() => import("./AiChat").then((module) => ({ default: module.AiChat })));

interface Position {
  x: number;
  y: number;
}

const clampPosition = (position: Position) => ({
  x: Math.min(Math.max(12, position.x), Math.max(12, window.innerWidth - 76)),
  y: Math.min(Math.max(72, position.y), Math.max(72, window.innerHeight - 144)),
});

const loadPosition = (): Position => {
  try {
    const saved = JSON.parse(localStorage.getItem(AI_STORAGE_KEYS.buttonPosition) ?? "null") as Position | null;
    if (saved) return clampPosition(saved);
  } catch {
    // ignore invalid local cache
  }
  return { x: window.innerWidth - 84, y: window.innerHeight - 168 };
};

export const TaskMateAIProvider = () => {
  const app = useApp();
  const location = useLocation();
  const { enabled, hasKey } = useAiSettings(app.currentUser?.id);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>(() => typeof window === "undefined" ? { x: 24, y: 120 } : loadPosition());
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number; moved: boolean } | null>(null);
  const processedRef = useRef<Set<string>>(new Set());
  const mentionBusyRef = useRef(false);
  const lastMentionAtRef = useRef(0);

  const showFloatingButton = enabled && !open && location.pathname === "/dashboard";
  const mentionPattern = useMemo(() => /@(taskmate ai|mateai)\b/i, []);

  useEffect(() => {
    if (!app.currentUser?.id) return;
    processedRef.current = loadProcessedMentions(app.currentUser.id);
  }, [app.currentUser?.id]);

  useEffect(() => {
    const onResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !app.currentUser?.id || !hasKey) return;
    if (mentionBusyRef.current) return;
    const candidate = [...app.groupMessages]
      .sort((a, b) => b.createdAt - a.createdAt)
      .find((message) =>
        message.content &&
        mentionPattern.test(message.content) &&
        !message.content.trim().toLowerCase().startsWith(`${AI_NAME.toLowerCase()}:`) &&
        !processedRef.current.has(message.id) &&
        app.visibleGroups.some((group) => group.id === message.groupId)
      );
    if (!candidate) return;

    const now = Date.now();
    if (now - lastMentionAtRef.current < 4000) return;
    lastMentionAtRef.current = now;
    mentionBusyRef.current = true;
    processedRef.current.add(candidate.id);
    saveProcessedMentions(app.currentUser.id, processedRef.current);

    void (async () => {
      try {
        const apiKey = await loadGeminiKey(app.currentUser?.id);
        if (!apiKey) return;
        const group = app.visibleGroups.find((item) => item.id === candidate.groupId);
        const answer = await askGemini({
          apiKey,
          prompt: candidate.content.replace(mentionPattern, "").trim() || candidate.content,
          context: `${buildAiContext(app)}\nCurrent group: ${group?.name ?? "unknown"}\nReply as ${AI_NAME} to a tagged group message.`,
        });
        const result = await app.addGroupMessage(candidate.groupId, `${AI_NAME}: ${answer.slice(0, 1200)}`, candidate.id);
        if (!result.ok) {
          processedRef.current.delete(candidate.id);
          if (app.currentUser?.id) saveProcessedMentions(app.currentUser.id, processedRef.current);
        }
      } catch {
        // Mentions should never interrupt the user's foreground work.
      } finally {
        window.setTimeout(() => {
          mentionBusyRef.current = false;
        }, 1200);
      }
    })();
  }, [enabled, hasKey, app, mentionPattern]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      dx: event.clientX - position.x,
      dy: event.clientY - position.y,
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampPosition({ x: event.clientX - drag.dx, y: event.clientY - drag.dy });
    if (Math.abs(next.x - position.x) > 2 || Math.abs(next.y - position.y) > 2) drag.moved = true;
    setPosition(next);
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    localStorage.setItem(AI_STORAGE_KEYS.buttonPosition, JSON.stringify(position));
    window.setTimeout(() => setDragging(false), 0);
  };

  const clickAssistant = () => {
    if (dragRef.current?.moved) {
      dragRef.current = null;
      return;
    }
    dragRef.current = null;
    if (!hasKey) toast.info(`Add a Gemini API key in Settings to unlock ${AI_NAME}.`);
    setOpen(true);
  };

  return (
    <>
      {showFloatingButton && (
        <Button
          type="button"
          size="icon"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onClick={clickAssistant}
          className={cn(
            "fixed z-[70] size-14 rounded-full bg-gradient-primary text-primary-foreground shadow-glow transition-bounce touch-none",
            dragging ? "scale-105 cursor-grabbing" : "cursor-grab hover:scale-105"
          )}
          style={{ left: position.x, top: position.y, willChange: "transform,left,top" }}
          aria-label={`Open ${AI_NAME}`}
          title={AI_NAME}
        >
          <span className="absolute inset-0 rounded-full bg-white/20 opacity-0 transition-opacity hover:opacity-100" />
          <Sparkles className="size-6" />
          <Bot className="absolute -bottom-1 -right-1 size-5 rounded-full bg-card p-0.5 text-primary shadow-soft" />
        </Button>
      )}
      {enabled && (
        <Suspense fallback={null}>
          <AiChat open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
};
