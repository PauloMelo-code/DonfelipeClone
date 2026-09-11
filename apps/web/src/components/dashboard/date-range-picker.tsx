"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isSameDay(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}
function formatLabel(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function getPresets(): { label: string; range: () => DateRange }[] {
  const today = new Date();
  return [
    {
      label: "Hoje",
      range: () => ({ startDate: startOfDay(today), endDate: endOfDay(today), label: "Hoje" }),
    },
    {
      label: "Ontem",
      range: () => {
        const y = addDays(today, -1);
        return { startDate: startOfDay(y), endDate: endOfDay(y), label: "Ontem" };
      },
    },
    {
      label: "Últimos 7 dias",
      range: () => ({
        startDate: startOfDay(addDays(today, -6)),
        endDate: endOfDay(today),
        label: "Últimos 7 dias",
      }),
    },
    {
      label: "Últimos 14 dias",
      range: () => ({
        startDate: startOfDay(addDays(today, -13)),
        endDate: endOfDay(today),
        label: "Últimos 14 dias",
      }),
    },
    {
      label: "Últimos 30 dias",
      range: () => ({
        startDate: startOfDay(addDays(today, -29)),
        endDate: endOfDay(today),
        label: "Últimos 30 dias",
      }),
    },
    {
      label: "Este mês",
      range: () => ({
        startDate: startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)),
        endDate: endOfDay(today),
        label: "Este mês",
      }),
    },
    {
      label: "Mês passado",
      range: () => {
        const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const last = new Date(today.getFullYear(), today.getMonth(), 0);
        return { startDate: startOfDay(first), endDate: endOfDay(last), label: "Mês passado" };
      },
    },
  ];
}

function MiniCalendar({
  month,
  year,
  selecting,
  hoverDate,
  onDayClick,
  onDayHover,
  onPrev,
  onNext,
  showPrev,
  showNext,
}: {
  month: number;
  year: number;
  selecting: { start: Date | null; end: Date | null };
  hoverDate: Date | null;
  onDayClick: (d: Date) => void;
  onDayHover: (d: Date) => void;
  onPrev?: () => void;
  onNext?: () => void;
  showPrev: boolean;
  showNext: boolean;
}) {
  const firstDay = new Date(year, month, 1);
  // Adjust so week starts on Monday (0=Mon ... 6=Sun)
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const today = new Date();
  const { start, end } = selecting;
  const rangeEnd = end || hoverDate;

  function isInRange(d: Date) {
    if (!start || !rangeEnd) return false;
    const lo = start <= rangeEnd ? start : rangeEnd;
    const hi = start <= rangeEnd ? rangeEnd : start;
    return d >= lo && d <= hi;
  }

  return (
    <div className="w-[200px]">
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          onClick={onPrev}
          className={cn("p-1 rounded text-muted-foreground hover:text-foreground transition-colors", !showPrev && "invisible")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold text-foreground">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={onNext}
          className={cn("p-1 rounded text-muted-foreground hover:text-foreground transition-colors", !showNext && "invisible")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-medium text-muted-foreground/50 py-0.5">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const isToday = isSameDay(d, today);
          const isStart = start ? isSameDay(d, start) : false;
          const isEnd = end ? isSameDay(d, end) : (hoverDate ? isSameDay(d, hoverDate) : false);
          const inRange = isInRange(d);
          const isFuture = d > today;

          return (
            <button
              key={i}
              disabled={isFuture}
              onClick={() => !isFuture && onDayClick(d)}
              onMouseEnter={() => !isFuture && onDayHover(d)}
              className={cn(
                "relative h-7 w-full text-[11px] font-medium rounded transition-colors",
                isFuture && "opacity-25 cursor-not-allowed",
                !isFuture && !isStart && !isEnd && !inRange && "hover:bg-brand-gold/20 hover:text-brand-gold text-muted-foreground",
                inRange && !isStart && !isEnd && "bg-brand-gold/10 text-brand-gold rounded-none",
                (isStart || isEnd) && "bg-brand-gold text-white rounded-full z-10",
                isToday && !isStart && !isEnd && "text-brand-gold font-bold",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [activePreset, setActivePreset] = useState(value.label);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const today = new Date();
  const [leftMonth, setLeftMonth] = useState(today.getMonth() - 1 < 0 ? 11 : today.getMonth() - 1);
  const [leftYear, setLeftYear] = useState(today.getMonth() - 1 < 0 ? today.getFullYear() - 1 : today.getFullYear());
  const [rightMonth, setRightMonth] = useState(today.getMonth());
  const [rightYear, setRightYear] = useState(today.getFullYear());

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelecting({ start: null, end: null });
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function prevMonth() {
    if (leftMonth === 0) { setLeftMonth(11); setLeftYear(y => y - 1); }
    else setLeftMonth(m => m - 1);
    if (rightMonth === 0) { setRightMonth(11); setRightYear(y => y - 1); }
    else setRightMonth(m => m - 1);
  }
  function nextMonth() {
    if (leftMonth === 11) { setLeftMonth(0); setLeftYear(y => y + 1); }
    else setLeftMonth(m => m + 1);
    if (rightMonth === 11) { setRightMonth(0); setRightYear(y => y + 1); }
    else setRightMonth(m => m + 1);
  }

  function handleDayClick(d: Date) {
    if (!selecting.start || (selecting.start && selecting.end)) {
      setSelecting({ start: startOfDay(d), end: null });
    } else {
      const start = selecting.start;
      const end = endOfDay(d);
      const [lo, hi] = start <= d ? [start, end] : [startOfDay(d), endOfDay(start)];
      const label = `${formatLabel(lo)} – ${formatLabel(hi)}`;
      onChange({ startDate: lo, endDate: hi, label });
      setActivePreset(label);
      setSelecting({ start: null, end: null });
      setOpen(false);
    }
  }

  function applyPreset(preset: ReturnType<typeof getPresets>[number]) {
    const range = preset.range();
    onChange(range);
    setActivePreset(range.label);
    setSelecting({ start: null, end: null });
    setOpen(false);
  }

  const presets = getPresets();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground hover:border-brand-gold/30 hover:bg-brand-gold/5 transition-all"
      >
        <Calendar className="h-3.5 w-3.5 text-brand-gold" />
        <span>{value.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className={cn(
          "absolute right-0 top-full mt-2 z-50 rounded-xl border border-white/[0.08] bg-[#0D0D0F] shadow-2xl flex overflow-hidden",
          isMobile && "left-0 right-0 flex-col"
        )}>
          {/* Presets */}
          <div className={cn(
            "border-white/[0.06] py-2",
            isMobile ? "border-b flex flex-wrap gap-1 px-2 pb-3" : "w-40 border-r"
          )}>
            {!isMobile && (
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                Presets
              </p>
            )}
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={cn(
                  "text-left px-3 py-1.5 text-xs transition-colors rounded-lg",
                  isMobile ? "border border-white/[0.06]" : "w-full",
                  activePreset === p.label
                    ? "bg-brand-gold/10 text-brand-gold font-medium border-brand-gold/20"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendars */}
          <div className="p-4 space-y-3">
            {selecting.start && !selecting.end && (
              <p className="text-[11px] text-brand-gold text-center">
                Selecione a data final
              </p>
            )}
            <div className={cn("flex gap-6", isMobile && "justify-center")}>
              {!isMobile && (
                <MiniCalendar
                  month={leftMonth}
                  year={leftYear}
                  selecting={selecting}
                  hoverDate={hoverDate}
                  onDayClick={handleDayClick}
                  onDayHover={setHoverDate}
                  onPrev={prevMonth}
                  onNext={undefined}
                  showPrev={true}
                  showNext={false}
                />
              )}
              <MiniCalendar
                month={rightMonth}
                year={rightYear}
                selecting={selecting}
                hoverDate={hoverDate}
                onDayClick={handleDayClick}
                onDayHover={setHoverDate}
                onPrev={prevMonth}
                onNext={nextMonth}
                showPrev={true}
                showNext={true}
              />
            </div>
            {/* Current range display */}
            <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
              <span className="text-[11px] text-muted-foreground">
                {selecting.start
                  ? `${formatLabel(selecting.start)} → selecione o fim`
                  : `${formatLabel(value.startDate)} → ${formatLabel(value.endDate)}`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
