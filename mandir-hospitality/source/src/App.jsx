import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Users,
  BusFront,
  BedDouble,
  Utensils,
  Bell,
  ChevronDown,
  ArrowUpRight,
  HeartHandshake,
  CircleHelp,
  Settings,
  CheckCheck,
  Check,
  X,
  UserRoundCheck,
  Search,
  CloudOff,
  Download,
  CircleDot,
} from "lucide-react";
import { useLocalStorage } from "./lib/storage";
import { seedGuests, dateISO } from "./lib/data";
import { roomInventory, initialLinen } from "./lib/rooms";
import Temple from "./components/Temple";
import Sheet from "./components/Sheet";
import GuestForm from "./components/GuestForm";
import Guests from "./views/Guests";
import { useSheetWorkspace } from "./lib/useSheetWorkspace";
import { SHEET_URL } from "./lib/sheets";
import "./styles/sheets.css";

const Transport = lazy(() => import("./views/Transport"));
const Accommodation = lazy(() => import("./views/Accommodation"));
const Kitchen = lazy(() => import("./views/Kitchen"));
const SheetAccommodation = lazy(() => import("./views/SheetAccommodation"));
const navigation = [
  { id: "guests", label: "Guest roster", short: "Guests", icon: Users },
  {
    id: "transport",
    label: "Transport dispatch",
    short: "Transport",
    icon: BusFront,
  },
  { id: "rooms", label: "Accommodation", short: "Rooms", icon: BedDouble },
  {
    id: "kitchen",
    label: "Mahaprasad kitchen",
    short: "Kitchen",
    icon: Utensils,
  },
];
const currentRoute = () =>
  navigation.some((n) => n.id === location.hash.slice(1))
    ? location.hash.slice(1)
    : "guests";

export default function App() {
  const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
  const sheetWorkspace = useSheetWorkspace(!demoMode);
  const [route, setRoute] = useState(currentRoute);
  const [demoGuests, setGuests] = useLocalStorage("seva.guests.v1", () => demoMode ? seedGuests : [], demoMode);
  const guests = demoMode ? demoGuests : sheetWorkspace.guests;
  const [linen, setLinen] = useLocalStorage("mandir-linen-v1", initialLinen);
  const [activity, setActivity] = useLocalStorage("seva.activity.v1", []);
  const [modal, setModal] = useState(null);
  const [quickQuery, setQuickQuery] = useState("");
  const [notification, setNotification] = useState(null);
  const toastTimer = useRef();
  const [storageError, setStorageError] = useState(false);
  const [clientIdDraft, setClientIdDraft] = useState(sheetWorkspace.clientId);
  const toast = useCallback((message) => {
    setNotification(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotification(null), 4500);
  }, []);
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.title = `${navigation.find((n) => n.id === route).label} · Mandir Hospitality`;
  }, [route]);
  useEffect(() => {
    const onError = () => setStorageError(true);
    window.addEventListener("seva-storage-unavailable", onError);
    return () => {
      window.removeEventListener("seva-storage-unavailable", onError);
      clearTimeout(toastTimer.current);
    };
  }, []);
  const navigate = (id) => {
    location.hash = id;
    setRoute(id);
    setModal(null);
  };
  const log = (message) =>
    setActivity((previous) =>
      [
        { id: crypto.randomUUID(), message, time: new Date().toISOString() },
        ...previous,
      ].slice(0, 30),
    );
  const onUpdateGuest = (id, patch) => {
    if (!demoMode) {
      toast("Use Accommodation to save lodging to the sheet. Other guest fields are read-only.");
      return false;
    }
    const guest = guests.find((g) => g.id === id);
    if (!guest) return false;
    const nextPatch = { ...patch };
    const releasesRoom =
      guest.room &&
      ((patch.status === "Departed" && guest.status !== "Departed") ||
        (patch.room !== undefined && patch.room !== guest.room) ||
        (patch.stay !== undefined && patch.stay !== guest.stay));
    if (!releasesRoom && guest.room && patch.count !== undefined) {
      const room = roomInventory.find((r) => r.id === guest.room);
      const otherOccupants = guests
        .filter(
          (g) =>
            g.id !== id && g.room === guest.room && g.status !== "Departed",
        )
        .reduce((sum, g) => sum + g.count, 0);
      if (
        room &&
        Number(patch.count) >
          room.capacity - otherOccupants - (linen[guest.room] || 0)
      ) {
        toast(
          "This room cannot accommodate the updated party size. Release or reassign the room first.",
        );
        return false;
      }
    }
    if (releasesRoom) {
      if (guest.stay === "Samarpan")
        setLinen((previous) => ({
          ...previous,
          [guest.room]: (previous[guest.room] || 0) + guest.count,
        }));
      if (patch.room === undefined) nextPatch.room = "";
    }
    setGuests((previous) =>
      previous.map((g) => (g.id === id ? { ...g, ...nextPatch } : g)),
    );
    const update =
      nextPatch.status && nextPatch.status !== guest.status
        ? nextPatch.status
        : nextPatch.room && nextPatch.room !== guest.room
          ? `room ${nextPatch.room} assigned`
          : nextPatch.transport && nextPatch.transport !== guest.transport
            ? "transport updated"
            : "details updated";
    log(`${guest.name}: ${update}`);
    return true;
  };
  const addGuest = (form) => {
    if (!demoMode) { toast("Add attendees in the source sheet, then refresh the roster."); return; }
    const guest = {
      ...form,
      id: `G-${Date.now().toString().slice(-6)}`,
      initials: form.name
        .split(/\s+/)
        .filter((w) => w !== "&")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase(),
      group:
        Number(form.count) > 2
          ? "Family"
          : Number(form.count) === 2
            ? "Couple"
            : "Individual",
      status: "Arriving",
      room: "",
      color: "peach",
      travel: form.transport === "Needed" ? "Pickup requested" : "Self-arrival",
    };
    setGuests((previous) => [guest, ...previous]);
    log(`${guest.name} added to the roster`);
    setModal(null);
    navigate("guests");
    toast(`${guest.name} added. A warm welcome awaits.`);
  };
  const checkIn = (guest) => {
    if (onUpdateGuest(guest.id, { status: "Checked in" }) === false) return;
    toast(`${guest.name} checked in successfully.`);
  };
  const pendingRooms = guests.filter(
    (g) => g.stay !== "Day visitor" && !g.room && !["Departed", "Cancelled"].includes(g.status),
  );
  const pendingTransport = guests.filter(
    (g) => g.transport === "Needed" && !["Departed", "Cancelled"].includes(g.status),
  );
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#guests"
          aria-label="Mandir Hospitality home"
        >
          <span className="brand-symbol">
            <Temple size={31} />
          </span>
          <span>
            mandir<span className="brand-sub">HOSPITALITY</span>
          </span>
        </a>
        <div className="campus-label">
          <span className="campus-mark">
            <Temple size={22} />
          </span>
          <div>
            <strong>Robbinsville Mandir</strong>
            <span>Hospitality operations</span>
          </div>
        </div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav className="side-navigation" aria-label="Main navigation">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={route === item.id ? "active" : ""}
              aria-current={route === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "guests" && (
                <span className="nav-count">{guests.length}</span>
              )}
            </a>
          ))}
        </nav>
        <button
          className="quick-checkin button secondary"
          disabled={!demoMode}
          onClick={() => {
            setQuickQuery("");
            setModal("quick");
          }}
        >
          <UserRoundCheck size={18} /> Quick check-in<span>↗</span>
        </button>
        <div className="sidebar-bottom">
          <div className="seva-note">
            <HeartHandshake size={24} />
            <p>
              A little care.
              <br />
              <strong>A meaningful stay.</strong>
            </p>
            <span>Every act of seva makes a difference.</span>
            <div className="note-decoration" aria-hidden="true">
              <Temple size={81} />
            </div>
          </div>
          <button className="side-utility" onClick={() => setModal("help")}>
            <CircleHelp size={18} /> Help & guidance
            <ArrowUpRight size={15} />
          </button>
          <button className="side-utility" onClick={() => setModal("settings")}>
            <Settings size={18} /> Workspace settings
          </button>
          <button className="user-profile" onClick={() => setModal("profile")}>
            <span className="avatar profile-avatar">SK</span>
            <span>
              <strong>Sevak team</strong>
              <small>Hospitality volunteer</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <a href="#guests" className="mobile-brand">
            <Temple size={27} />
            <span>
              mandir<span>HOSPITALITY</span>
            </span>
          </a>
          <div className="breadcrumb">
            Workspace<span>/</span>
            <strong>{navigation.find((n) => n.id === route).label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="local-status">
              <span className="status-dot" />
              {!demoMode ? "Google Sheets source" : storageError ? "Session only" : "Saved on this device"}
            </span>
            <span className="demo-label">{demoMode ? "DEMO" : "SHEET"}</span>
            <span className="topbar-divider" />
            <button
              className="icon-button notification-button"
              aria-label="Open notifications"
              onClick={() => setModal("notifications")}
            >
              <Bell size={20} />
              {(pendingRooms.length > 0 || activity.length > 0) && <i />}
            </button>
            <button
              className="avatar top-avatar"
              aria-label="SK · Open profile and settings"
              onClick={() => setModal("profile")}
            >
              SK
            </button>
          </div>
        </header>
        {!demoMode && <section className="sheet-connection" aria-label="Google Sheets connection">
          <div><strong>Google Sheets guest roster</strong><p>{sheetWorkspace.loading ? "Refreshing attendee data…" : sheetWorkspace.refreshedAt ? `Last refreshed ${sheetWorkspace.refreshedAt.toLocaleTimeString()}` : "Waiting for source data"} · {sheetWorkspace.connected ? "Google authorized; sheet edit access is required" : "Read-only until Google sign-in"}</p></div>
          <button className="button secondary small" disabled={sheetWorkspace.loading || sheetWorkspace.saving} onClick={sheetWorkspace.refresh}>Refresh sheet</button>
          {sheetWorkspace.connected ? <button className="button secondary small" disabled={sheetWorkspace.saving} onClick={sheetWorkspace.disconnect}>Sign out</button> : <button className="button primary small" onClick={() => { if (!sheetWorkspace.clientId) setModal("settings"); else sheetWorkspace.connect(); }}>Sign in with Google</button>}
          {sheetWorkspace.error && <p className="sheet-connection-error" role="alert">{sheetWorkspace.error}</p>}
        </section>}
        {storageError && (
          <div className="storage-banner">
            <CloudOff size={16} /> Browser storage is unavailable. Changes will
            last for this session only.
          </div>
        )}
        <main id="main-content" className="main-content" tabIndex={-1}>
          <div className="workspace-context">
            <span>
              <span className="context-dot" /> ROBBINSVILLE MANDIR{" "}
              <span className="context-separator">/</span> SEVA WORKSPACE
            </span>
            <span>
              {route === "kitchen" ? `Today · ${dateLabel}` : dateLabel}
            </span>
          </div>
          <Suspense
            fallback={
              <div className="view-loading">
                <span className="loading-spinner" />
                Preparing your workspace…
              </div>
            }
          >
            {route === "guests" && (
              <Guests
                guests={guests}
                readOnly={!demoMode}
                onUpdateGuest={onUpdateGuest}
                toast={toast}
                onAdd={() => demoMode ? setModal("add") : toast("Add attendees in the Google source sheet, then refresh.")}
                onNavigate={navigate}
              />
            )}
            {route === "transport" && (
              <Transport
                guests={guests}
                sheetMode={!demoMode}
                onUpdateGuest={onUpdateGuest}
                toast={toast}
              />
            )}
            {route === "rooms" && !demoMode && <SheetAccommodation workspace={sheetWorkspace} toast={toast} />}
            {route === "rooms" && demoMode && (
              <Accommodation
                guests={guests}
                onUpdateGuest={onUpdateGuest}
                toast={toast}
                linen={linen}
                setLinen={setLinen}
              />
            )}
            {route === "kitchen" && (
              <Kitchen
                guests={guests}
                sheetMode={!demoMode}
                onUpdateGuest={onUpdateGuest}
                toast={toast}
              />
            )}
          </Suspense>
          <footer className="page-footer">
            <span>
              <Temple size={16} /> Seva, thoughtfully connected.
            </span>
            <span>
              Mandir Hospitality <span className="footer-dot">·</span> {demoMode ? "Sample workspace" : "Google Sheets roster"}
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation.map((item) => (
          <a
            href={`#${item.id}`}
            key={item.id}
            className={route === item.id ? "active" : ""}
            aria-current={route === item.id ? "page" : undefined}
          >
            <span>
              <item.icon size={22} strokeWidth={route === item.id ? 2 : 1.7} />
            </span>
            {item.short}
          </a>
        ))}
      </nav>
      {modal === "add" && (
        <Sheet
          title="Welcome a new guest"
          subtitle="A few details to make their arrival seamless."
          onClose={() => setModal(null)}
        >
          <GuestForm onSave={addGuest} onCancel={() => setModal(null)} />
        </Sheet>
      )}
      {modal === "quick" && (
        <Sheet
          title="Quick check-in"
          subtitle="Find an arriving guest and welcome them to the mandir."
          onClose={() => setModal(null)}
        >
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Find guest to check in"
              placeholder="Search guest or group…"
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
            />
          </label>
          <div className="quick-guest-list">
            {guests
              .filter(
                (g) =>
                  g.status === "Arriving" &&
                  g.name.toLowerCase().includes(quickQuery.toLowerCase()),
              )
              .map((g) => (
                <div key={g.id}>
                  <span className={`avatar ${g.color}`}>{g.initials}</span>
                  <span>
                    <strong>{g.name}</strong>
                    <small>
                      {g.count} guests · {g.room || "Room pending"}
                    </small>
                  </span>
                  <button
                    className="button primary small"
                    onClick={() => checkIn(g)}
                  >
                    Check in
                  </button>
                </div>
              ))}
            {!guests.some(
              (g) =>
                g.status === "Arriving" &&
                g.name.toLowerCase().includes(quickQuery.toLowerCase()),
            ) && (
              <div className="empty-state">
                <CheckCheck />
                <h3>All caught up</h3>
                <p>No arriving guests match your search.</p>
              </div>
            )}
          </div>
        </Sheet>
      )}
      {modal === "notifications" && (
        <Sheet
          title="Your attention, please"
          subtitle="A little coordination goes a long way."
          onClose={() => setModal(null)}
        >
          <div className="notification-list">
            {pendingRooms.length > 0 && (
              <button onClick={() => navigate("rooms")}>
                <span className="notification-icon amber">
                  <BedDouble size={20} />
                </span>
                <span>
                  <strong>
                    {pendingRooms.length} groups need accommodation
                  </strong>
                  <small>Assign rooms before they arrive.</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            )}
            {pendingTransport.length > 0 && (
              <button onClick={() => navigate("transport")}>
                <span className="notification-icon blue">
                  <BusFront size={20} />
                </span>
                <span>
                  <strong>
                    {pendingTransport.length} groups need a pickup
                  </strong>
                  <small>Head to transport to coordinate a vehicle.</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            )}
          </div>
          <div className="form-section-label">RECENT ACTIVITY</div>
          {activity.length ? (
            activity.slice(0, 8).map((a) => (
              <div className="activity-item" key={a.id}>
                <Check size={16} />
                <span>
                  {a.message}
                  <small>
                    {new Date(a.time).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </small>
                </span>
              </div>
            ))
          ) : (
            <p className="muted-text">
              Your check-ins and guest updates will appear here.
            </p>
          )}
        </Sheet>
      )}
      {(modal === "settings" || modal === "profile") && (
        <Sheet
          title={
            modal === "profile" ? "Your seva workspace" : "Workspace settings"
          }
          subtitle="Robbinsville Mandir · Hospitality team"
          onClose={() => setModal(null)}
        >
          <div className="profile-card">
            <span className="avatar profile-avatar large">SK</span>
            <div>
              <h3>Sevak team</h3>
              <p>Hospitality volunteer</p>
            </div>
            <span className="badge amber">{demoMode ? "Demo" : "Sheet source"}</span>
          </div>
          <div className="settings-section">
            <h3>About this workspace</h3>
            {demoMode ? <p>This demo uses sample guests, saved in this browser.</p> : <>
              <p>Guest data comes from the source sheet. Lodging changes write only AD (location), AE (room number), and AF (custom code). Other fields are read-only. Guest records and Google access tokens are not saved to browser storage.</p>
              <p>Kitchen headcount adjustments remain device-local. Transport dispatch plans are session-only and clear on reload. Neither is written to this sheet.</p>
              <a className="button secondary" href={SHEET_URL} target="_blank" rel="noreferrer">Open source sheet</a>
              <label className="field">Google OAuth client ID<input value={clientIdDraft} onChange={(e) => setClientIdDraft(e.target.value)} placeholder="…apps.googleusercontent.com" /></label>
              <p>A Google web OAuth client ID is public configuration, not a password or client secret. The project must enable Google Sheets API and allow this website’s origin. Google’s Sheets permission can cover all spreadsheets accessible to your account; this app targets only the configured source sheet.</p>
              <button className="button secondary" onClick={() => { try { sheetWorkspace.configureClientId(clientIdDraft); toast("Google sign-in configuration saved. Now sign in to enable lodging writes."); } catch (error) { toast(error.message); } }}>Save Google sign-in configuration</button>
              <button className="button primary" onClick={sheetWorkspace.connect}>Sign in with Google</button>
            </>}
          </div>
          <button
            className="button secondary full-width"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        guests,
                        activity,
                        exportedAt: new Date().toISOString(),
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `mandir-guests-${dateISO()}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              toast("Workspace backup downloaded.");
            }}
          >
            <Download size={17} /> Download guest backup
          </button>
          <button
            className="button secondary full-width settings-help"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={17} /> Open quick-start guide
          </button>
        </Sheet>
      )}
      {modal === "help" && (
        <Sheet
          title="A smoother day of seva"
          subtitle="Your quick guide to Mandir Hospitality."
          onClose={() => setModal(null)}
        >
          <div className="help-items">
            {[
              {
                icon: Users,
                title: "Welcome your guests",
                body: "Search the roster by name, city or registration ID. Open a guest to see their journey, update details or check them in.",
              },
              {
                icon: BusFront,
                title: "Coordinate every arrival",
                body: "Assign a vehicle to a waiting group. Dispatch it when the driver leaves and mark it complete once everyone reaches the mandir.",
              },
              {
                icon: BedDouble,
                title: "Find a comfortable stay",
                body: "Filter rooms by block and availability, then choose a room to assign it to a guest group.",
              },
              {
                icon: Utensils,
                title: "Prepare mahaprasad with care",
                body: "Choose a planning day, switch between meals, and adjust the expected volunteers, walk-in visitors and preparation buffer. Each date keeps its own plan.",
              },
            ].map((i) => (
              <div key={i.title}>
                <i.icon size={23} />
                <section>
                  <h3>{i.title}</h3>
                  <p>{i.body}</p>
                </section>
              </div>
            ))}
          </div>
          <p className="help-note">
            <CircleDot size={16} /> Your updates are saved on this device.
          </p>
        </Sheet>
      )}
      {notification && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          <p>{notification}</p>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotification(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
