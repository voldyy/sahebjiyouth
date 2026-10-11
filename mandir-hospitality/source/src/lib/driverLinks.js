export function driverFromUrl(href) {
  const url = new URL(href);
  return (
    new URLSearchParams(url.hash.split("?")[1] || "").get("driver") ||
    url.searchParams.get("driver") ||
    "All"
  );
}
export function driverUrl(href, driver) {
  const url = new URL(href);
  url.searchParams.delete("driver");
  url.hash =
    "transport" +
    (driver && driver !== "All"
      ? "?" + new URLSearchParams({ driver }).toString()
      : "");
  return url.toString();
}
