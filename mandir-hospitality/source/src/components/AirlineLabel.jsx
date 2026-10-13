import { useState } from "react";
import { Plane } from "lucide-react";
import { airlineForFlight } from "../lib/airlines";

export default function AirlineLabel({ flight, airport }) {
  const airline = airlineForFlight(flight);
  const displayName = airline?.name.replace(/\s+(?:Airlines|Airways|Air Lines)$/i, "");
  const [failedLogo, setFailedLogo] = useState(null);
  return <div className="transport-carrier">
    <span className="transport-airline-logo" aria-hidden="true">
      {airline && failedLogo !== airline.code
        ? <img src={`${import.meta.env.BASE_URL}airlines/${airline.code}.png`} alt="" width="18" height="18" loading="lazy" decoding="async" onError={() => setFailedLogo(airline.code)} />
        : <Plane size={14} />}
    </span>
    <div className="transport-flight-identity">
      <h3 className="transport-flight-number">{flight || "Flight journey"}</h3>
      <span className="transport-carrier-text"><span className="transport-airline-name">{displayName || "Airline unknown"}</span><span className="transport-airport"> · {airport || "Location needed"}</span></span>
    </div>
  </div>;
}
