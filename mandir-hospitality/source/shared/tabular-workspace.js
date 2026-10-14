// Small tabular domain store. No Google calls: mutations happen synchronously
// against a request-local copy and are committed atomically by SQLite.
export function tabularWorkspace(tables) {
  const data = structuredClone(tables);
  const sheets = new Map();
  const wrap = (name) => {
    if (sheets.has(name)) return sheets.get(name);
    const sheet = {
      getSheetId: () => name === "Attendees" ? 0 : 1,
      getLastRow: () => data[name].length,
      setFrozenRows() { return this; },
      setColumnWidths() { return this; },
      getDataRange() { return this.getRange(1, 1, Math.max(1, data[name].length), data[name][0]?.length || 1); },
      getRange(row, col, count, width) {
        return {
          getDisplayValues: () => Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => String(data[name][row + i - 1]?.[col + j - 1] ?? ""))),
          setNumberFormat() { return this; }, setBackground() { return this; },
          setFontColor() { return this; }, setFontWeight() { return this; },
          setValues(values) {
            values.forEach((r, i) => r.forEach((v, j) => {
              data[name][row + i - 1] ||= [];
              // The domain writes literal spreadsheet text. Store its actual
              // value, matching Sheets' apostrophe escaping exactly once.
              data[name][row + i - 1][col + j - 1] = String(v).replace(/^'/, "");
            }));
            return this;
          },
        };
      },
    };
    sheets.set(name, sheet);
    return sheet;
  };
  return {
    data,
    getSheets: () => Object.keys(data).map(wrap),
    getSheetByName: name => data[name] ? wrap(name) : null,
    insertSheet: name => { data[name] = []; return wrap(name); },
  };
}
