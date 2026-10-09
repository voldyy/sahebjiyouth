import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { dateISO } from "../lib/data";
import "../styles/day-selector.css";

const WINDOW_DAYS = 21;
const fullDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const month = new Intl.DateTimeFormat("en-US", { month: "short" });

function localDate(value) {
  return new Date(`${value}T12:00:00`);
}

function moveDay(value, offset) {
  const date = localDate(value);
  date.setDate(date.getDate() + offset);
  return dateISO(date);
}

export default function DaySelector({ value, onChange }) {
  const today = dateISO();
  const [windowStart, setWindowStart] = useState(() =>
    value >= today && value <= moveDay(today, WINDOW_DAYS - 1)
      ? today
      : moveDay(value, -3),
  );
  const stripRef = useRef(null);
  const selectedRef = useRef(null);
  const dates = useMemo(
    () =>
      Array.from({ length: WINDOW_DAYS }, (_, index) => {
        const iso = moveDay(windowStart, index);
        return { iso, date: localDate(iso) };
      }),
    [windowStart],
  );

  useEffect(() => {
    if (value < windowStart || value > moveDay(windowStart, WINDOW_DAYS - 1)) {
      setWindowStart(value === today ? today : moveDay(value, -3));
    }
  }, [value, windowStart, today]);

  useEffect(() => {
    const strip = stripRef.current;
    const selected = selectedRef.current;
    if (!strip || !selected) return;

    // Scroll only the date strip, so choosing a date never shifts the page.
    const stripBounds = strip.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    const padding = 4;
    if (selectedBounds.left < stripBounds.left + padding) {
      strip.scrollLeft -= stripBounds.left + padding - selectedBounds.left;
    } else if (selectedBounds.right > stripBounds.right - padding) {
      strip.scrollLeft += selectedBounds.right - stripBounds.right + padding;
    }
  }, [value, dates]);

  function chooseDate(nextValue) {
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(nextValue) &&
      !Number.isNaN(localDate(nextValue).getTime())
    ) {
      onChange(nextValue);
    }
  }

  return (
    <section className="day-selector" aria-label="Kitchen planning day">
      <div className="day-selector-heading">
        <div className="day-selector-title">
          <span className="day-selector-eyebrow">Planning day</span>
          <h2 aria-live="polite" aria-atomic="true">
            {fullDate.format(localDate(value))}
          </h2>
        </div>
        <div className="day-selector-actions">
          <button
            className="day-selector-today"
            type="button"
            onClick={() => onChange(today)}
            aria-label="Today"
          >
            Today
          </button>
          <label className="day-selector-calendar" title="Choose planning date">
            <CalendarDays size={19} aria-hidden="true" />
            <span>Choose planning date</span>
            <input
              aria-label="Choose planning date"
              type="date"
              value={value}
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => chooseDate(event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="day-selector-navigation">
        <button
          className="day-selector-arrow"
          type="button"
          aria-label="Previous day"
          onClick={() => onChange(moveDay(value, -1))}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div
          className="day-selector-strip"
          ref={stripRef}
          role="group"
          aria-label="Select a planning day; swipe for more dates"
        >
          {dates.map(({ iso, date }) => (
            <button
              className={`day-selector-day${value === iso ? " is-selected" : ""}${iso === today ? " is-today" : ""}`}
              type="button"
              key={iso}
              ref={value === iso ? selectedRef : null}
              onClick={() => onChange(iso)}
              aria-label={`${fullDate.format(date)}${iso === today ? ", Today" : ""}`}
              aria-pressed={value === iso}
            >
              <span>{iso === today ? "Today" : weekday.format(date)}</span>
              <strong>{date.getDate()}</strong>
              <span>{month.format(date)}</span>
            </button>
          ))}
        </div>
        <button
          className="day-selector-arrow"
          type="button"
          aria-label="Next day"
          onClick={() => onChange(moveDay(value, 1))}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <p className="day-selector-hint">Swipe through days or choose a date.</p>
    </section>
  );
}
