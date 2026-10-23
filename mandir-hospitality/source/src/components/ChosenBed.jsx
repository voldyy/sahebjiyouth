import { BedDouble } from "lucide-react";
import { roomLabel, roomPlaceLabel } from "../lib/offsite";

export default function ChosenBed({ room, bed, onChange, disabled }) {
  return <div className="stay-chosen-bed">
    <BedDouble size={21} aria-hidden="true" />
    <div><small>{room.lodging || "Samarpan"}</small><strong>{roomLabel(room)} · {roomPlaceLabel(room, bed)}</strong></div>
    <button type="button" disabled={disabled} onClick={onChange} aria-label="Change room or bed">Change</button>
  </div>;
}
