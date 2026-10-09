import { useMemo, useState } from "react";
import {
  ArrowRight,
  BedDouble,
  Building2,
  Check,
  ChevronRight,
  KeyRound,
  Plus,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import Sheet from "../components/Sheet";
import { roomInventory } from "../lib/rooms";
import "../styles/operations.css";

export default function Accommodation({
  guests,
  onUpdateGuest,
  toast,
  linen,
  setLinen,
}) {
  const [filter, setFilter] = useState("All rooms");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(null);
  const [guestId, setGuestId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");

  const allRooms = useMemo(
    () =>
      roomInventory.map((room) => {
        const occupants = guests.filter(
          (guest) =>
            guest.room === room.id &&
            guest.stay === room.property &&
            guest.status !== "Departed",
        );
        const occupied = occupants.reduce(
          (sum, guest) => sum + Number(guest.count),
          0,
        );
        const cleaning = Math.min(
          linen[room.id] || 0,
          Math.max(0, room.capacity - occupied),
        );
        return {
          ...room,
          occupants,
          occupied,
          cleaning,
          available: Math.max(0, room.capacity - occupied - cleaning),
        };
      }),
    [guests, linen],
  );
  const rooms = allRooms.filter((room) => room.property === "Samarpan");
  const waitingGuests = guests.filter(
    (guest) =>
      guest.stay !== "Day visitor" &&
      !guest.room &&
      guest.status !== "Departed",
  );
  const offsiteGuests = guests.filter(
    (guest) => guest.stay === "Offsite" && guest.status !== "Departed",
  );
  const selectedGuest = guests.find((guest) => guest.id === guestId);
  const selectedRoom = allRooms.find((room) => room.id === roomId);
  const totalBeds = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const occupiedBeds = rooms.reduce((sum, room) => sum + room.occupied, 0);
  const availableBeds = rooms.reduce((sum, room) => sum + room.available, 0);
  const linenCount = rooms.reduce((sum, room) => sum + room.cleaning, 0);
  const shownRooms = rooms.filter(
    (room) =>
      (filter === "All rooms" ||
        filter === `Wing ${room.wing}` ||
        (filter === "Linen tasks" && room.cleaning > 0)) &&
      [room.id, room.kind, ...room.occupants.map((guest) => guest.name)]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  function openAssign(preselectedRoom = "", preselectedGuest = "") {
    setRoomId(preselectedRoom);
    setGuestId(preselectedGuest);
    setError("");
    setSheet({ type: "assign" });
  }

  function assignRoom(event) {
    event.preventDefault();
    if (!selectedGuest || !selectedRoom) return;
    if (Number(selectedGuest.count) > selectedRoom.available) {
      setError(
        `This party needs ${selectedGuest.count} beds. Please choose a room with enough space.`,
      );
      return;
    }
    if (selectedRoom.property !== selectedGuest.stay) {
      setError("Choose a room in the guest’s selected accommodation.");
      return;
    }
    onUpdateGuest(guestId, { room: roomId, stay: selectedRoom.property });
    setSheet(null);
    toast(`Room ${roomId} assigned to ${selectedGuest.name}.`);
  }

  function markReady(room) {
    setLinen((previous) => ({ ...previous, [room.id]: 0 }));
    toast(
      `Room ${room.id}: ${room.cleaning} ${room.cleaning === 1 ? "bed is" : "beds are"} clean and ready.`,
    );
  }

  function releaseRoom(guest, room) {
    onUpdateGuest(guest.id, { room: "" });
    setSheet(null);
    toast(`Room released. ${guest.count} beds added to the linen queue.`);
  }

  return (
    <div className="op-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">A PLACE TO FEEL AT HOME</p>
          <h1 className="page-title">Accommodation</h1>
          <p className="page-description">
            Thoughtful stays, from arrival to farewell.
          </p>
        </div>
        <button className="button primary" onClick={() => openAssign()}>
          <Plus size={17} /> Assign room
        </button>
      </div>

      <div className="op-stat-grid">
        <div className="card op-stat">
          <span className="op-stat-icon green">
            <BedDouble size={21} />
          </span>
          <div>
            <span className="op-stat-label">Available beds</span>
            <strong>
              {availableBeds}
              <small> clean & ready</small>
            </strong>
          </div>
        </div>
        <div className="card op-stat">
          <span className="op-stat-icon blue">
            <Users size={20} />
          </span>
          <div>
            <span className="op-stat-label">Beds allocated</span>
            <strong>
              {occupiedBeds}
              <small> of {totalBeds} beds</small>
            </strong>
          </div>
        </div>
        <button
          className="card op-stat op-stat-button"
          onClick={() => {
            setFilter("Linen tasks");
            setQuery("");
          }}
        >
          <span className="op-stat-icon amber">
            <Sparkles size={20} />
          </span>
          <div>
            <span className="op-stat-label">Linen refresh</span>
            <strong>
              {linenCount}
              <small> beds to prepare</small>
            </strong>
          </div>
          <ChevronRight className="op-stat-chevron" size={17} />
        </button>
      </div>

      {waitingGuests.length > 0 && (
        <section className="room-waiting">
          <span className="room-waiting-icon">
            <KeyRound size={20} />
          </span>
          <div>
            <strong>
              {waitingGuests.length}{" "}
              {waitingGuests.length === 1 ? "party is" : "parties are"} waiting
              for a room
            </strong>
            <p>
              {waitingGuests.reduce(
                (sum, guest) => sum + Number(guest.count),
                0,
              )}{" "}
              guests arriving. Let’s get their stay ready.
            </p>
          </div>
          <button
            className="button small room-waiting-button"
            onClick={() => openAssign("", waitingGuests[0].id)}
          >
            Assign <ArrowRight size={16} />
          </button>
        </section>
      )}

      <div className="room-property-heading">
        <div className="room-property-title">
          <span>
            <Building2 size={20} />
          </span>
          <div>
            <h2>Samarpan Sadan</h2>
            <p>
              {rooms.length} rooms <span className="op-dot">·</span> 3 wings{" "}
              <span className="op-dot">·</span> On campus
            </p>
          </div>
        </div>
        <div className="room-occupancy">
          <span>{Math.round((occupiedBeds / totalBeds) * 100)}% allocated</span>
          <div>
            <i style={{ width: `${(occupiedBeds / totalBeds) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="op-toolbar room-toolbar">
        <div className="room-filters" role="group" aria-label="Room filters">
          {["All rooms", "Wing A", "Wing B", "Wing C", "Linen tasks"].map(
            (item) => (
              <button
                key={item}
                className={filter === item ? "active" : ""}
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
              >
                {item === "Linen tasks" && <Sparkles size={13} />}
                {item}
                {item === "Linen tasks" && <span>{linenCount}</span>}
              </button>
            ),
          )}
        </div>
        <label className="search-field op-search">
          <Search size={17} />
          <input
            type="search"
            placeholder="Search room or guest…"
            aria-label="Search rooms and guests"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="room-legend">
        <span>
          <i className="occupied" /> Allocated
        </span>
        <span>
          <i className="available" /> Available
        </span>
        <span>
          <i className="cleaning" /> Linen refresh
        </span>
      </div>
      <div className="room-grid">
        {shownRooms.map((room) => (
          <article className="card room-card" key={room.id}>
            <div className="room-card-header">
              <div className="room-number">{room.id}</div>
              <div className="room-title">
                <h3>Room {room.id}</h3>
                <p>
                  {room.floor} <span className="op-dot">·</span> {room.kind}
                </p>
              </div>
              <span
                className={`badge ${room.available > 0 ? "green" : "gray"}`}
              >
                {room.available > 0 ? `${room.available} open` : "Full"}
              </span>
            </div>
            <div
              className="room-bed-grid"
              style={{ "--bed-columns": Math.min(room.capacity, 4) }}
            >
              {Array.from({ length: room.capacity }, (_, index) => {
                const bedState =
                  index < room.occupied
                    ? "occupied"
                    : index < room.occupied + room.cleaning
                      ? "cleaning"
                      : "available";
                return (
                  <button
                    key={index}
                    className={`room-bed ${bedState}`}
                    aria-label={`Room ${room.id}, bed ${index + 1}: ${bedState === "occupied" ? "allocated, view guests" : bedState === "cleaning" ? "needs linen refresh" : "available, assign guest"}`}
                    onClick={() =>
                      bedState === "available"
                        ? openAssign(room.id)
                        : setSheet({ type: "room", roomId: room.id })
                    }
                  >
                    <BedDouble size={20} />
                    <span>B{index + 1}</span>
                    {bedState === "available" && (
                      <Plus size={11} className="room-bed-plus" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="room-guest-list">
              {room.occupants.length ? (
                room.occupants.map((guest) => (
                  <button
                    className="room-guest-row"
                    key={guest.id}
                    onClick={() => setSheet({ type: "room", roomId: room.id })}
                  >
                    <span
                      className={`avatar op-avatar room-avatar ${guest.color || ""}`}
                    >
                      {guest.initials}
                    </span>
                    <span>
                      <strong>{guest.name}</strong>
                      <small>
                        {guest.count} {guest.count === 1 ? "guest" : "guests"}{" "}
                        <span className="op-dot">·</span> {guest.status}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))
              ) : (
                <div className="room-no-guests">
                  <span>
                    {room.cleaning
                      ? "Preparing a welcoming stay"
                      : "Ready for a warm welcome"}
                  </span>
                </div>
              )}
            </div>
            <div className="room-card-footer">
              <span>
                {room.occupied} of {room.capacity} beds allocated
              </span>
              {room.cleaning > 0 ? (
                <button
                  className="room-linen-action"
                  onClick={() => markReady(room)}
                >
                  <Sparkles size={13} /> Mark {room.cleaning} ready
                </button>
              ) : (
                <span className="room-ready">
                  <Check size={13} /> Linen ready
                </span>
              )}
            </div>
          </article>
        ))}
      </div>

      {shownRooms.length === 0 && (
        <div className="card empty-state op-empty">
          <BedDouble size={30} />
          <h3>
            {filter === "Linen tasks" && !query
              ? "Every bed is ready"
              : "No matching rooms"}
          </h3>
          <p>
            {filter === "Linen tasks" && !query
              ? "The linen queue is clear. Thank you for your seva."
              : "Try another room number, guest name or wing."}
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setFilter("All rooms");
              setQuery("");
            }}
          >
            View all rooms
          </button>
        </div>
      )}

      {offsiteGuests.length > 0 && (
        <button
          className="card room-offsite"
          onClick={() => setSheet({ type: "offsite" })}
        >
          <span className="op-stat-icon blue">
            <Building2 size={20} />
          </span>
          <span>
            <strong>Offsite accommodation</strong>
            <small>
              {offsiteGuests.length} parties <span className="op-dot">·</span>{" "}
              {offsiteGuests.reduce(
                (sum, guest) => sum + Number(guest.count),
                0,
              )}{" "}
              guests staying nearby
            </small>
          </span>
          <ArrowRight size={19} />
        </button>
      )}

      {sheet?.type === "assign" && (
        <Sheet
          title="Make room for a warm welcome"
          subtitle="Assign one room to keep the whole party together."
          onClose={() => setSheet(null)}
        >
          <form className="op-form" onSubmit={assignRoom}>
            {waitingGuests.length === 0 ? (
              <div className="op-empty">
                <CheckCheckIcon />
                <h3>Everyone has a room</h3>
                <p>There are no unassigned guests right now.</p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setSheet(null)}
                >
                  Back to rooms
                </button>
              </div>
            ) : (
              <>
                <label className="field">
                  Guest or group
                  <select
                    value={guestId}
                    onChange={(event) => {
                      setGuestId(event.target.value);
                      const nextGuest = guests.find(
                        (guest) => guest.id === event.target.value,
                      );
                      if (
                        selectedRoom &&
                        selectedRoom.property !== nextGuest?.stay
                      )
                        setRoomId("");
                      setError("");
                    }}
                    required
                  >
                    <option value="" disabled>
                      Select a guest
                    </option>
                    {waitingGuests.map((guest) => (
                      <option value={guest.id} key={guest.id}>
                        {guest.name} · {guest.count} beds
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Room
                  <select
                    value={roomId}
                    onChange={(event) => {
                      setRoomId(event.target.value);
                      setError("");
                    }}
                    required
                  >
                    <option value="" disabled>
                      Choose an available room
                    </option>
                    {allRooms
                      .filter(
                        (room) =>
                          room.available > 0 &&
                          (!selectedGuest ||
                            room.property === selectedGuest.stay),
                      )
                      .map((room) => (
                        <option
                          value={room.id}
                          key={room.id}
                          disabled={
                            selectedGuest &&
                            Number(selectedGuest.count) > room.available
                          }
                        >
                          {room.id} · {room.available} beds available ·{" "}
                          {room.kind}
                        </option>
                      ))}
                  </select>
                </label>
                {selectedRoom && (
                  <div className="op-form-summary">
                    <BedDouble size={22} />
                    <div>
                      <strong>
                        Room {selectedRoom.id} ·{" "}
                        {selectedRoom.property === "Offsite"
                          ? "Fairfield Inn"
                          : `Wing ${selectedRoom.wing}`}
                      </strong>
                      <p>
                        {selectedRoom.floor} <span className="op-dot">·</span>{" "}
                        {selectedRoom.available} clean beds available
                      </p>
                    </div>
                  </div>
                )}
                {selectedGuest &&
                  selectedRoom &&
                  Number(selectedGuest.count) > selectedRoom.available && (
                    <p className="op-form-error" role="alert">
                      This party needs {selectedGuest.count} beds. Choose a
                      larger room.
                    </p>
                  )}
                {error && (
                  <p className="op-form-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button primary op-full-button"
                  type="submit"
                  disabled={
                    !selectedGuest ||
                    !selectedRoom ||
                    Number(selectedGuest.count) > selectedRoom.available
                  }
                >
                  <KeyRound size={17} /> Assign room
                </button>
              </>
            )}
          </form>
        </Sheet>
      )}

      {sheet?.type === "room" &&
        (() => {
          const room = rooms.find((item) => item.id === sheet.roomId);
          return (
            <Sheet
              title={`Room ${room.id}`}
              subtitle={`${room.kind} · ${room.floor} · Wing ${room.wing}`}
              onClose={() => setSheet(null)}
            >
              <div className="op-form">
                <div className="op-form-summary">
                  <BedDouble size={22} />
                  <div>
                    <strong>
                      {room.occupied} allocated · {room.available} available
                    </strong>
                    <p>
                      {room.capacity} beds total
                      {room.cleaning > 0
                        ? ` · ${room.cleaning} need fresh linen`
                        : " · All linen ready"}
                    </p>
                  </div>
                </div>
                {room.occupants.map((guest) => (
                  <div className="room-occupant-detail" key={guest.id}>
                    <span className="op-avatar">{guest.initials}</span>
                    <div>
                      <strong>{guest.name}</strong>
                      <small>
                        {guest.count} guests · {guest.status}
                      </small>
                    </div>
                    <button
                      className="button secondary small"
                      onClick={() => releaseRoom(guest, room)}
                    >
                      Release
                    </button>
                  </div>
                ))}
                {room.occupants.length > 0 && (
                  <p className="op-form-note">
                    Releasing a room returns the party to the unassigned list
                    and adds their beds to the linen queue.
                  </p>
                )}
                {room.cleaning > 0 && (
                  <button
                    className="button secondary op-full-button"
                    onClick={() => markReady(room)}
                  >
                    <Sparkles size={17} /> Mark {room.cleaning} beds clean &
                    ready
                  </button>
                )}
                {room.available > 0 && (
                  <button
                    className="button primary op-full-button"
                    onClick={() => openAssign(room.id)}
                  >
                    <Plus size={17} /> Assign a guest
                  </button>
                )}
              </div>
            </Sheet>
          );
        })()}

      {sheet?.type === "offsite" && (
        <Sheet
          title="Offsite accommodation"
          subtitle="A quick reference for guests staying nearby."
          onClose={() => setSheet(null)}
        >
          <div className="op-form">
            {offsiteGuests.map((guest) => (
              <div className="room-offsite-detail" key={guest.id}>
                <span className={`avatar op-avatar ${guest.color || ""}`}>
                  {guest.initials}
                </span>
                <div>
                  <strong>{guest.name}</strong>
                  <small>
                    {guest.count} guests · {guest.status}
                  </small>
                </div>
                <span className="badge blue">{guest.room || "Unassigned"}</span>
              </div>
            ))}
            <p className="op-form-note">
              Offsite rooms are listed separately from the Samarpan Sadan bed
              count.
            </p>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function CheckCheckIcon() {
  return <Check size={30} />;
}
