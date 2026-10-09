import { useMemo, useState } from "react";
import {
  Users,
  UserRoundCheck,
  Clock3,
  BedDouble,
  Search,
  SlidersHorizontal,
  Plus,
  Download,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Plane,
  BusFront,
  Check,
  Phone,
  Pencil,
  CalendarDays,
  X,
  Utensils,
  StickyNote,
  LogOut,
  HeartHandshake,
  ArrowDownUp,
} from "lucide-react";
import { dateISO, formatTime, statusTone } from "../lib/data";
import { exportCsv } from "../lib/storage";
import Sheet from "../components/Sheet";
import GuestForm from "../components/GuestForm";
import "../styles/guests.css";

const statuses = ["All guests", "Arriving", "Checked in", "Needs room"];
export default function Guests({
  guests,
  onUpdateGuest,
  toast,
  onAdd,
  onNavigate,
  readOnly = false,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All guests");
  const [stay, setStay] = useState("All stays");
  const [arrivalDate, setArrivalDate] = useState("");
  const [sort, setSort] = useState("Default");
  const [limit, setLimit] = useState(6);
  const [selectedId, setSelectedId] = useState(null);
  const [edit, setEdit] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const selected = guests.find((g) => g.id === selectedId);
  const total = guests.reduce((n, g) => n + g.count, 0);
  const stayOptions = readOnly ? ["Samarpan", "Comfort Inn", "Hawthorn", "Pending lodging", "Day visitor"] : ["Samarpan", "Offsite", "Day visitor"];
  const visibleStatuses = readOnly ? ["All guests", "Registered", "Cancelled", "Needs room"] : statuses;
  const checked = guests
    .filter((g) => g.status === "Checked in")
    .reduce((n, g) => n + g.count, 0);
  const arriving = guests
    .filter((g) => g.status === "Arriving")
    .reduce((n, g) => n + g.count, 0);
  const pendingRooms = guests.filter(
    (g) => g.stay !== "Day visitor" && !g.room && !["Departed", "Cancelled"].includes(g.status),
  );
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const list = guests.filter(
      (g) =>
        (!normalized ||
          `${g.name} ${g.city} ${g.registrationId || g.id} ${g.phone} ${g.room} ${g.lodging || ""}`
            .toLowerCase()
            .includes(normalized)) &&
        (filter === "All guests" ||
          (filter === "Needs room"
            ? g.stay !== "Day visitor" && !g.room && !["Departed", "Cancelled"].includes(g.status)
            : g.status === filter)) &&
        (stay === "All stays" || g.stay === stay) &&
        (!arrivalDate || g.arrivalDate === arrivalDate),
    );
    if (sort === "Arrival time")
      list.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
    if (sort === "Guest name")
      list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [guests, query, filter, stay, arrivalDate, sort]);
  const reset = () => {
    setQuery("");
    setFilter("All guests");
    setStay("All stays");
    setArrivalDate("");
    setSort("Default");
    setLimit(6);
  };
  const checkIn = (g) => {
    if (onUpdateGuest(g.id, { status: "Checked in" }) === false) return;
    toast(`${g.name} checked in. Jai Swaminarayan!`);
  };
  const exportGuests = () => {
    exportCsv(`mandir-guests-${dateISO()}.csv`, [
      [
        "Registration ID",
        "Guest name",
        "City",
        "Phone",
        "Guests",
        "Arrival date",
        "Arrival time",
        "Status",
        "Stay",
        "Room",
        "Custom room code",
        "Diet",
      ],
      ...filtered.map((g) => [
        g.registrationId || g.id,
        g.name,
        g.city,
        g.phone,
        g.count,
        g.arrivalDate,
        g.arrivalTime,
        g.status,
        g.stay,
        g.roomNo || g.room,
        g.roomCode || "",
        g.diet,
      ]),
    ]);
    toast(`${filtered.length} guest groups exported.`);
  };
  const counts = {
    Registered: guests.filter((g) => g.status === "Registered").length,
    Cancelled: guests.filter((g) => g.status === "Cancelled").length,
    "All guests": guests.length,
    Arriving: guests.filter((g) => g.status === "Arriving").length,
    "Checked in": guests.filter((g) => g.status === "Checked in").length,
    "Needs room": pendingRooms.length,
  };
  return (
    <div className="guests-view">
      <header className="page-header">
        <div>
          <div className="eyebrow">EVERY ARRIVAL MATTERS</div>
          <h1 className="page-title">
            Guest roster<span className="title-dot">.</span>
          </h1>
          <p className="page-description">
            A warm welcome starts with a little thoughtful planning.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="button secondary export-button"
            onClick={exportGuests}
          >
            <Download size={17} />
            <span>Export</span>
          </button>
          <button className="button primary add-guest" disabled={readOnly} onClick={onAdd}>
            <Plus size={18} /> Add guest
          </button>
        </div>
      </header>
      <div className="stat-grid guest-stats">
        {[
          {
            label: "Total guests",
            value: total,
            icon: Users,
            foot: readOnly ? `Across ${guests.length} attendee rows` : `Across ${guests.length} registered groups`,
            tone: "amber",
            tiny: "REGISTERED",
          },
          {
            label: readOnly ? "Registered" : "Checked in",
            value: readOnly ? counts.Registered : checked,
            icon: UserRoundCheck,
            foot: readOnly ? "Check-in is not recorded in this sheet" : "Welcomed to the mandir",
            tone: "green",
            tiny: readOnly ? "SOURCE" : `${Math.round((checked / Math.max(total, 1)) * 100)}% ARRIVED`,
          },
          {
            label: readOnly ? "Lodging assigned" : "Arriving",
            value: readOnly ? guests.filter((g) => g.room).length : arriving,
            icon: Clock3,
            foot: readOnly ? "Room assignments from AD–AF" : "A warm welcome awaits",
            tone: "blue",
            tiny: "EXPECTED",
          },
          {
            label: "Needs a room",
            value: pendingRooms.reduce((n, g) => n + g.count, 0),
            icon: BedDouble,
            foot: `${pendingRooms.length} ${readOnly ? "attendees" : "groups"} awaiting allocation`,
            tone: "rose",
            tiny: "TO COORDINATE",
          },
        ].map((s) => (
          <div key={s.label} className={`stat-card guest-stat ${s.tone}`}>
            <div className="stat-top">
              <span>{s.label}</span>
              <span className={`stat-icon ${s.tone}`}>
                <s.icon size={19} />
              </span>
            </div>
            <div className="stat-number">
              {s.value.toLocaleString()}
              <span className={`stat-tag ${s.tone}`}>{s.tiny}</span>
            </div>
            <div className="stat-foot">{s.foot}</div>
          </div>
        ))}
      </div>
      {pendingRooms.length > 0 && (
        <div className="welcome-banner">
          <span className="welcome-icon">
            <HeartHandshake size={21} />
          </span>
          <div>
            <strong>Let’s make every stay feel like home.</strong>
            <span>
              {pendingRooms.length} {readOnly ? "attendees" : "arriving groups"} are waiting for room
              assignments.
            </span>
          </div>
          <button onClick={() => onNavigate("rooms")}>
            Assign rooms
            <ArrowRight size={17} />
          </button>
        </div>
      )}
      <section className="card roster-card" aria-label="Guest roster">
        <div className="roster-card-top">
          <div>
            <h2>All the right details. One place.</h2>
            <p>Manage arrivals, stays, and a little extra care.</p>
          </div>
          <span className="roster-total">
            <Users size={15} />
            {guests.length} groups
          </span>
        </div>
        <div className="roster-controls">
          <div
            className="roster-tabs"
            role="group"
            aria-label="Filter by guest status"
          >
            {visibleStatuses.map((status) => (
              <button
                key={status}
                className={filter === status ? "active" : ""}
                aria-pressed={filter === status}
                onClick={() => {
                  setFilter(status);
                  setLimit(6);
                }}
              >
                {status}
                <span>{counts[status]}</span>
              </button>
            ))}
          </div>
          <div className="roster-search-row">
            <label className="search-field">
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(6);
                }}
                placeholder="Search by name, city or guest ID…"
                aria-label="Search guests"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={16} />
                </button>
              )}
            </label>
            <div className="stay-select">
              <BedDouble size={16} />
              <select
                aria-label="Filter by accommodation"
                value={stay}
                onChange={(e) => {
                  setStay(e.target.value);
                  setLimit(6);
                }}
              >
                <option>All stays</option>
                {stayOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <ChevronDown size={15} />
            </div>
            <button
              className={`button secondary filter-button ${arrivalDate || sort !== "Default" ? "has-filters" : ""}`}
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal size={17} />
              <span>Filters</span>
            </button>
          </div>
        </div>
        <div className="guest-table-wrap">
          <table className="guest-table">
            <thead>
              <tr>
                <th>GUEST / GROUP</th>
                <th>ARRIVAL</th>
                <th>ACCOMMODATION</th>
                <th>STATUS</th>
                <th className="table-action-heading">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((g) => (
                <tr key={g.id}>
                  <td>
                    <button
                      className="guest-name-cell"
                      onClick={() => {
                        setSelectedId(g.id);
                        setEdit(false);
                      }}
                    >
                      <span className={`avatar ${g.color}`}>{g.initials}</span>
                      <span>
                        <strong>{g.name}</strong>
                        <small>
                          <MapPin size={11} />
                          {g.city}
                          <i /> {g.count} {g.count === 1 ? "guest" : "guests"}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <div className="table-detail">
                      <strong>{formatTime(g.arrivalTime)}</strong>
                      <span>
                        <Plane size={12} />
                        {g.travel}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="table-detail">
                      <strong
                        className={
                          !g.room && g.stay !== "Day visitor"
                            ? "needs-room-text"
                            : ""
                        }
                      >
                        {g.room
                          ? g.lodging || (g.stay === "Offsite"
                            ? "Fairfield Inn"
                            : "Samarpan Sadan")
                          : g.stay === "Day visitor"
                            ? "Day visitor"
                            : "Room pending"}
                      </strong>
                      <span>
                        {g.room
                          ? `Room ${g.roomNo || g.room}${g.roomCode ? ` · ${g.roomCode}` : ""}`
                          : g.stay === "Day visitor"
                            ? "No overnight stay"
                            : "Awaiting assignment"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${statusTone(g.status)}`}>
                      <span className="badge-dot" />
                      {g.status}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      {g.status === "Arriving" ? (
                        <button
                          className="checkin-button"
                          onClick={() => checkIn(g)}
                        >
                          <UserRoundCheck size={14} /> Check in
                        </button>
                      ) : (
                        <button
                          className="details-button"
                          onClick={() => {
                            setSelectedId(g.id);
                            setEdit(false);
                          }}
                        >
                          View details
                        </button>
                      )}
                      <button
                        className="icon-button small"
                        aria-label={`View ${g.name}`}
                        onClick={() => {
                          setSelectedId(g.id);
                          setEdit(false);
                        }}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-guest-list">
          {filtered.slice(0, limit).map((g) => (
            <article className="mobile-guest-card" key={g.id}>
              <div className="mobile-guest-top">
                <button
                  className="mobile-guest-name"
                  onClick={() => {
                    setSelectedId(g.id);
                    setEdit(false);
                  }}
                >
                  <span className={`avatar ${g.color}`}>{g.initials}</span>
                  <span>
                    <strong>{g.name}</strong>
                    <small>{g.city}</small>
                  </span>
                </button>
                <span className={`badge ${statusTone(g.status)}`}>
                  <span className="badge-dot" />
                  {g.status}
                </span>
              </div>
              <div className="mobile-guest-details">
                <span>
                  <Clock3 size={14} />
                  {formatTime(g.arrivalTime)}
                  <i /> {g.count} guests
                </span>
                <span
                  className={
                    !g.room && g.stay !== "Day visitor" ? "needs-room-text" : ""
                  }
                >
                  <BedDouble size={14} />
                  {g.room
                    ? `${g.lodging || (g.stay === "Offsite" ? "Fairfield Inn" : "Samarpan")} · ${g.roomNo || g.room}${g.roomCode ? ` · ${g.roomCode}` : ""}`
                    : g.stay === "Day visitor"
                      ? "Day visitor"
                      : "Room assignment pending"}
                </span>
              </div>
              <div className="mobile-guest-bottom">
                <span className="guest-id">{g.registrationId || g.id}</span>
                <button
                  className="mobile-details"
                  onClick={() => {
                    setSelectedId(g.id);
                    setEdit(false);
                  }}
                >
                  Details
                  <ChevronRight size={14} />
                </button>
                {g.status === "Arriving" && (
                  <button
                    className="button primary small"
                    onClick={() => checkIn(g)}
                  >
                    <UserRoundCheck size={15} />
                    Check in
                  </button>
                )}
                {g.status === "Checked in" && (
                  <span className="checked-label">
                    <Check size={15} /> Welcomed
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">
            <Search size={30} />
            <h3>No guests found</h3>
            <p>Try another name or adjust your filters.</p>
            <button className="button secondary" onClick={reset}>
              Clear all filters
            </button>
          </div>
        )}
        <div className="roster-pagination">
          <span>
            Showing <strong>{Math.min(limit, filtered.length)}</strong> of{" "}
            <strong>{filtered.length}</strong> groups
          </span>
          {limit < filtered.length ? (
            <button
              className="button secondary small"
              onClick={() => setLimit(limit + 6)}
            >
              Show more
              <ChevronDown size={15} />
            </button>
          ) : (
            <span className="all-shown">
              <Check size={14} /> You’re all caught up
            </span>
          )}
        </div>
      </section>
      <div className="roster-insights">
        <section className="card arrival-overview">
          <div className="section-heading">
            <div>
              <span className="eyebrow">AHEAD OF THE ARRIVALS</span>
              <h2>Today’s welcome, at a glance</h2>
            </div>
            <span className="soft-icon">
              <Clock3 size={19} />
            </span>
          </div>
          <div className="arrival-bars">
            {[
              {
                label: "Morning",
                range: "Before 12 PM",
                predicate: (g) => g.arrivalTime < "12:00",
              },
              {
                label: "Afternoon",
                range: "12 – 5 PM",
                predicate: (g) =>
                  g.arrivalTime >= "12:00" && g.arrivalTime < "17:00",
              },
              {
                label: "Evening",
                range: "After 5 PM",
                predicate: (g) => g.arrivalTime >= "17:00",
              },
            ].map((period) => {
              const n = guests
                .filter(
                  (g) => g.arrivalDate === dateISO() && period.predicate(g),
                )
                .reduce((sum, g) => sum + g.count, 0);
              return (
                <div key={period.label}>
                  <span>
                    {period.label}
                    <small>{period.range}</small>
                  </span>
                  <div className="arrival-bar-track">
                    <div
                      style={{
                        width: `${Math.max((n / Math.max(total, 1)) * 100, 2)}%`,
                      }}
                    />
                  </div>
                  <strong>{n}</strong>
                </div>
              );
            })}
          </div>
        </section>
        <section className="care-card">
          <div className="care-top">
            <span>
              <HeartHandshake size={21} />
            </span>
            <span>THOUGHTFUL HOSPITALITY</span>
          </div>
          <h2>
            Small details.
            <br />A warmer welcome.
          </h2>
          <p>
            Dietary preferences, accessible rooms, and a familiar face at the
            gate. It all adds up.
          </p>
          <button onClick={() => onNavigate("kitchen")}>
            Plan mahaprasad
            <ArrowUpRight size={17} />
          </button>
        </section>
      </div>
      {filtersOpen && (
        <Sheet
          title="Find the right guests"
          subtitle="Narrow your roster to what matters right now."
          onClose={() => setFiltersOpen(false)}
        >
          <div className="filter-form">
            <label className="field">
              Arrival date
              <input
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
              />
            </label>
            <label className="field">
              Accommodation
              <select value={stay} onChange={(e) => setStay(e.target.value)}>
                <option>All stays</option>
                {stayOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option>Default</option>
                <option>Arrival time</option>
                <option>Guest name</option>
              </select>
            </label>
            <div className="form-footer">
              <button className="button secondary" onClick={reset}>
                Reset filters
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setFiltersOpen(false);
                  setLimit(6);
                }}
              >
                Show {filtered.length} groups
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </Sheet>
      )}
      {selected && (
        <Sheet
          title={edit ? "Edit guest details" : "A thoughtful welcome"}
          subtitle={edit ? selected.name : `Guest details · ${selected.registrationId || selected.id}`}
          onClose={() => {
            setSelectedId(null);
            setEdit(false);
          }}
        >
          {edit ? (
            <GuestForm
              guest={selected}
              onCancel={() => setEdit(false)}
              onSave={(form) => {
                if (onUpdateGuest(selected.id, form) === false) return;
                setEdit(false);
                toast("Guest details saved.");
              }}
            />
          ) : (
            <>
              <div className="guest-detail-profile">
                <span className={`avatar large ${selected.color}`}>
                  {selected.initials}
                </span>
                <h3>{selected.name}</h3>
                <p>
                  <MapPin size={14} />
                  {selected.city} <i /> {selected.count} guests
                </p>
                <span className={`badge ${statusTone(selected.status)}`}>
                  <span className="badge-dot" />
                  {selected.status}
                </span>
              </div>
              <div className="guest-detail-list">
                <div>
                  <CalendarDays size={19} />
                  <span>
                    Arrival
                    <strong>
                      {new Date(
                        `${selected.arrivalDate}T12:00:00`,
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {formatTime(selected.arrivalTime)}
                    </strong>
                    <small>{selected.travel}</small>
                  </span>
                </div>
                <div>
                  <BedDouble size={19} />
                  <span>
                    Accommodation
                    <strong>
                      {selected.stay}
                      {selected.room ? ` · Room ${selected.roomNo || selected.room}${selected.roomCode ? ` · ${selected.roomCode}` : ""}` : ""}
                    </strong>
                    {!selected.room && selected.stay !== "Day visitor" && (
                      <button
                        onClick={() => {
                          setSelectedId(null);
                          onNavigate("rooms");
                        }}
                      >
                        Assign a room
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </span>
                </div>
                <div>
                  <BusFront size={19} />
                  <span>
                    Transport
                    <strong>
                      {selected.transport === "Needed"
                        ? "Pickup needed"
                        : selected.transport === "Assigned"
                          ? "Vehicle assigned"
                          : "Self-arrival"}
                    </strong>
                    {selected.transport === "Needed" && (
                      <button
                        onClick={() => {
                          setSelectedId(null);
                          onNavigate("transport");
                        }}
                      >
                        Coordinate pickup
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </span>
                </div>
                <div>
                  <Utensils size={19} />
                  <span>
                    Mahaprasad preference
                    <strong>{selected.diet || "Regular"} vegetarian</strong>
                  </span>
                </div>
                {selected.phone && (
                  <div>
                    <Phone size={19} />
                    <span>
                      Contact
                      <a href={`tel:${selected.phone.replace(/[^+\d]/g, "")}`}>
                        {selected.phone}
                        <ArrowUpRight size={13} />
                      </a>
                    </span>
                  </div>
                )}
                {selected.notes && (
                  <div>
                    <StickyNote size={19} />
                    <span>
                      A little extra care
                      <strong className="guest-note">{selected.notes}</strong>
                    </span>
                  </div>
                )}
              </div>
              <div className="form-footer">
                <button
                  className="button secondary"
                  disabled={readOnly}
                  onClick={() => setEdit(true)}
                >
                  <Pencil size={16} />
                  Edit details
                </button>
                {selected.status === "Arriving" ? (
                  <button
                    className="button primary"
                    onClick={() => checkIn(selected)}
                  >
                    <UserRoundCheck size={17} />
                    Check in
                  </button>
                ) : selected.status === "Checked in" ? (
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (onUpdateGuest(selected.id, { status: "Departed" }) === false) return;
                      toast(`${selected.name} checked out. Safe travels!`);
                    }}
                  >
                    <LogOut size={16} />
                    Check out
                  </button>
                ) : (
                  <span className="badge gray">{readOnly ? "Source fields are read-only" : "Stay completed"}</span>
                )}
              </div>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}
