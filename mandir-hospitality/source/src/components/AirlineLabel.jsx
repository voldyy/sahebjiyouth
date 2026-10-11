import { useState } from "react";
import { Plane } from "lucide-react";
import { airlineForFlight } from "../lib/airlines";

export default function AirlineLabel({ flight, airport }) {
  const airline = airlineForFlight(flight);
  const [failedLogo, setFailedLogo] = useState(null);
  return <div className="transport-carrier">
    <span className="transport-airline-logo" aria-hidden="true">
      {airline && failedLogo !== airline.code
        ? <img src={`${import.meta.env.BASE_URL}airlines/${airline.code}.png`} alt="" width="22" height="22" loading="lazy" decoding="async" onError={() => setFailedLogo(airline.code)} />
        : <Plane size={17} />}
    </span>
    <span className="transport-carrier-text"><span className="transport-airline-name">{airline?.name || "Airline unknown"}</span><span className="transport-airport"> · {airport || "Location needed"}</span></span>
  </div>;
}
