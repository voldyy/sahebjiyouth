// Flight numbers identify the marketing carrier; codeshares may operate on a partner.
const carriers = [
  ["EY", "ETD", "Etihad Airways"],
  ["UA", "UAL", "United Airlines"],
  ["AA", "AAL", "American Airlines"],
  ["EK", "UAE", "Emirates"],
  ["DL", "DAL", "Delta Air Lines"],
  ["AI", "AIC", "Air India"],
  ["QR", "QTR", "Qatar Airways"],
  ["BA", "BAW", "British Airways"],
  ["AC", "ACA", "Air Canada"],
  ["LH", "DLH", "Lufthansa"],
  ["B6", "JBU", "JetBlue"],
  ["WN", "SWA", "Southwest Airlines"],
  ["6E", "IGO", "IndiGo"],
  ["TK", "THY", "Turkish Airlines"],
  ["SQ", "SIA", "Singapore Airlines"],
  ["AS", "ASA", "Alaska Airlines"],
  ["AF", "AFR", "Air France"],
  ["KL", "KLM", "KLM"],
  ["VS", "VIR", "Virgin Atlantic"],
  ["LX", "SWR", "SWISS"],
  ["CX", "CPA", "Cathay Pacific"],
  ["NZ", "ANZ", "Air New Zealand"],
  ["TP", "TAP", "TAP Air Portugal"],
  ["F9", "FFT", "Frontier Airlines"],
  ["NK", "NKS", "Spirit Airlines"],
];
const byPrefix = new Map(carriers.flatMap(([iata, icao, name]) => [
  [iata, { code: iata, name }], [icao, { code: iata, name }],
]));

export function airlineForFlight(flight) {
  const normalized = String(flight || "").toUpperCase().replace(/[\s-]/g, "");
  const prefix = normalized.match(/^([A-Z]{3}|[A-Z0-9]{2})\d{1,4}[A-Z]?$/)?.[1];
  return byPrefix.get(prefix) || null;
}
