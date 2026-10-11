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
  const params = new URLSearchParams(url.hash.split("?")[1] || "");
  params.delete("admin");
  if (driver && driver !== "All") params.set("driver", driver);
  else params.delete("driver");
  url.hash = "transport" + (params.size ? `?${params}` : "");
  return url.toString();
}
