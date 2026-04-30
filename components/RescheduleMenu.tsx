"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import { addDays, nextMonday, startOfDay, setHours, setMinutes } from "date-fns";
import { cn } from "@/lib/utils";

// 23:59 local = "no specific time" sentinel (matches resolveDue default)
function toSentinel(d: Date): string {
  const out = setMinutes(setHours(startOfDay(d), 23), 59);
  return out.toISOString();
}

const OPTIONS = [
  { label: "Today",     sub: "bring back to today",  iso: () => toSentinel(new Date())                  },
  { label: "Tomorrow",  sub: "push one day",          iso: () => toSentinel(addDays(new Date(), 1))      },
  { label: "Next week", sub: "Monday",                iso: () => toSentinel(nextMonday(new Date()))      },
  { label: "No date",   sub: "remove due date",       iso: () => null                                    },
] as const;

type Props = {
  onReschedule: (date: string | null) => void;
  iconSize?: string;
  className?: string;
  alwaysVisible?: boolean;
};

export default function RescheduleMenu({ onReschedule, iconSize = "w-3.5 h-3.5", className, alwaysVisible }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent | TouchEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={cn(
          "text-muted-foreground hover:text-foreground transition",
          !alwaysVisible && "opacity-0 group-hover:opacity-100",
          open && "opacity-100 text-foreground",
          className,
        )}
        aria-label="Reschedule"
      >
        <CalendarClock className={iconSize} />
      </button>

      {open && (
        <div className="absolute right-0 bottom-7 z-30 bg-background border border-border rounded-2xl shadow-xl p-1.5 min-w-[152px]">
          {OPTIONS.map((o) => (
            <button
              key={o.label}
              onClick={(e) => {
                e.stopPropagation();
                onReschedule(o.iso());
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-muted transition flex flex-col gap-0.5"
            >
              <span className="text-xs font-medium">{o.label}</span>
              <span className="text-[10px] text-muted-foreground">{o.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
