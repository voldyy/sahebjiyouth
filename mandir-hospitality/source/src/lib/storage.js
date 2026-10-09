import { useEffect, useState } from "react";

export function useLocalStorage(key, initialValue, persist = true) {
  const [value, setValue] = useState(() => {
    try {
      const saved = persist ? localStorage.getItem(key) : null;
      if (saved !== null) return JSON.parse(saved);
    } catch {
      /* Browser storage may be restricted. Keep the app usable in memory. */
    }
    return typeof initialValue === "function" ? initialValue() : initialValue;
  });
  useEffect(() => {
    if (!persist) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      window.dispatchEvent(new Event("seva-storage-unavailable"));
    }
  }, [key, value, persist]);
  useEffect(() => {
    if (!persist) return;
    const sync = (event) => {
      if (event.key === key && event.newValue !== null) {
        try {
          setValue(JSON.parse(event.newValue));
        } catch {
          /* Ignore malformed external storage. */
        }
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key, persist]);
  return [value, setValue];
}

export function exportCsv(filename, rows) {
  const escape = (value) => {
    let text = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const csv =
    "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
