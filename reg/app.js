const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby1KSx4FkD4j3dRfz33quE_3XRd_N8JV6xG12BAE2mWj21EC7tSa4CVeZRIOsyEXvHH/exec";

const { useEffect, useMemo, useState } = React;

const CONTACTS_STORAGE_KEY = "mahapujaContacts.v1";
const CONTACTS_STORAGE_TTL = 1000 * 60 * 20;

const initialForm = {
  phone: "",
  name: "",
  email: "",
  zipCode: "",
  cityState: "",
};

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.slice(0, 10);
}

function formatPhone(value) {
  const digits = normalizePhone(value);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function digitsForDisplay(phone) {
  const digits = normalizePhone(phone);
  if (digits.length !== 10) return digits;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function readStoredContacts() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(CONTACTS_STORAGE_KEY) || "null");
    if (!stored || !Array.isArray(stored.contacts)) return [];
    if (Date.now() - stored.savedAt > CONTACTS_STORAGE_TTL) return [];
    return stored.contacts;
  } catch (error) {
    return [];
  }
}

function storeContacts(contacts) {
  try {
    window.sessionStorage.setItem(
      CONTACTS_STORAGE_KEY,
      JSON.stringify({ savedAt: Date.now(), contacts })
    );
  } catch (error) {
    // Storage can be disabled in private browsing; suggestions still work from memory.
  }
}

function filterContacts(contacts, prefix) {
  if (prefix.length < 2) return [];
  return contacts.filter((contact) => contact.phone.startsWith(prefix)).slice(0, 8);
}

async function scriptRequest(path, options = {}) {
  if (!GOOGLE_SCRIPT_URL) {
    throw new Error("Missing Google Apps Script URL. Set GOOGLE_SCRIPT_URL in app.js after deployment.");
  }

  const response = await fetch(`${GOOGLE_SCRIPT_URL}${path}`, options);
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "The RSVP service could not process the request.");
  }

  return data;
}

function App() {
  const [form, setForm] = useState(initialForm);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [lookupState, setLookupState] = useState("idle");
  const [lookupMessage, setLookupMessage] = useState("");
  const [submitState, setSubmitState] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [lookupMatched, setLookupMatched] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [contacts, setContacts] = useState(() => readStoredContacts());
  const [contactsReady, setContactsReady] = useState(() => readStoredContacts().length > 0);
  const [contactsLoadFailed, setContactsLoadFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const phoneDigits = normalizePhone(form.phone);

  const canSubmit = useMemo(() => {
    return (
      detailsVisible &&
      phoneDigits.length === 10 &&
      form.name.trim()
    );
  }, [detailsVisible, phoneDigits, form]);

  useEffect(() => {
    if (!GOOGLE_SCRIPT_URL) return;
    if (contacts.length > 0) return;

    let cancelled = false;

    async function loadContacts() {
      try {
        const data = await scriptRequest("?action=contacts");
        const loadedContacts = Array.isArray(data.contacts) ? data.contacts : [];
        if (cancelled) return;
        setContacts(loadedContacts);
        setContactsReady(true);
        setContactsLoadFailed(false);
        storeContacts(loadedContacts);
      } catch (error) {
        if (!cancelled) {
          setContactsReady(false);
          setContactsLoadFailed(true);
        }
      }
    }

    loadContacts();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phoneDigits.length < 2 || phoneDigits.length >= 10) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }

    const matches = filterContacts(contacts, phoneDigits);
    setSuggestions(matches);
    setSuggestOpen(matches.length > 0);
  }, [contacts, phoneDigits]);

  useEffect(() => {
    if (!contactsLoadFailed || !GOOGLE_SCRIPT_URL) return;
    if (phoneDigits.length < 2 || phoneDigits.length >= 10) return;

    let cancelled = false;

    async function loadPrefixSuggestions() {
      try {
        const data = await scriptRequest(`?action=suggest&prefix=${encodeURIComponent(phoneDigits)}`);
        if (cancelled) return;
        const matches = data.suggestions || [];
        setSuggestions(matches);
        setSuggestOpen(matches.length > 0);
      } catch (error) {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestOpen(false);
        }
      }
    }

    loadPrefixSuggestions();

    return () => {
      cancelled = true;
    };
  }, [contactsLoadFailed, phoneDigits]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setSubmitMessage("");
    setSubmitState("idle");
  }

  function updatePhone(value) {
    setForm((current) => ({ ...current, phone: formatPhone(value) }));
    setLookupState("idle");
    setLookupMessage("");
    setSubmitMessage("");
    setSubmitState("idle");
    if (detailsVisible) {
      setDetailsVisible(false);
      setLookupMatched(false);
      setForm((current) => ({
        ...current,
        name: "",
        email: "",
        zipCode: "",
        cityState: "",
      }));
    }
  }

  function applyContact(contact, matched) {
    setForm((current) => ({
      ...current,
      phone: formatPhone(contact.phone || current.phone),
      name: contact.name || "",
      email: contact.email || "",
      zipCode: contact.zipCode ? String(contact.zipCode) : "",
      cityState: contact.cityState || "",
    }));
    setLookupMatched(matched);
    setDetailsVisible(true);
    setSuggestOpen(false);
  }

  async function lookupPhone(phoneValue = form.phone) {
    const digits = normalizePhone(phoneValue);
    if (digits.length !== 10) {
      setLookupState("error");
      setLookupMessage("Enter a 10 digit phone number.");
      return;
    }

    setLookupState("loading");
    setLookupMessage("");
    setLookupMatched(false);

    try {
      const data = await scriptRequest(`?action=lookup&phone=${encodeURIComponent(digits)}`);
      if (data.found) {
        applyContact({ ...data.contact, phone: digits }, true);
        setLookupState("success");
        setLookupMessage("We found your contact record. Please review it before submitting.");
      } else {
        setForm((current) => ({ ...current, phone: formatPhone(digits) }));
        setDetailsVisible(true);
        setLookupState("info");
        setLookupMessage("That phone number was not found. Please complete the RSVP manually.");
      }
    } catch (error) {
      setLookupState("error");
      setLookupMessage(error.message);
    }
  }

  async function handleLookup(event) {
    event.preventDefault();
    await lookupPhone();
  }

  async function selectSuggestion(suggestion) {
    setForm((current) => ({
      ...current,
      phone: formatPhone(suggestion.phone),
      name: suggestion.name || current.name,
    }));
    setSuggestOpen(false);
    await lookupPhone(suggestion.phone);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSubmit) {
      setSubmitState("error");
      setSubmitMessage("Complete all required fields before submitting.");
      return;
    }

    setSubmitState("loading");
    setSubmitMessage("");

    const payload = {
      phone: phoneDigits,
      name: form.name.trim(),
      email: form.email.trim(),
      zipCode: String(form.zipCode).trim(),
      cityState: form.cityState.trim(),
      yajman: "Yes",
      lookupStatus: lookupMatched ? "Matched" : "Manual",
    };

    try {
      await scriptRequest("", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      setSubmitState("success");
      setSubmitted(true);
      setSubmitMessage("");
      setForm(initialForm);
      setDetailsVisible(false);
      setLookupMatched(false);
      setLookupState("idle");
      setLookupMessage("");
      setSuggestions([]);
      setSuggestOpen(false);
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(error.message);
    }
  }

  const lookupStatusClass =
    lookupState === "success" ? "success" : lookupState === "error" ? "error" : "info";
  const submitStatusClass = submitState === "success" ? "success" : "error";

  if (submitted) {
    return React.createElement(
      "main",
      { className: "page" },
      React.createElement(
        "section",
        { className: "form-card confirmation-card", "aria-labelledby": "confirmationTitle" },
        React.createElement(
          "header",
          { className: "form-header" },
          React.createElement("img", {
            className: "logo",
            src: "./HIRES_AMLOGO_color_sm.png",
            alt: "Allentown Mandir",
          }),
          React.createElement("p", { className: "eyebrow" }, "RSVP Received"),
          React.createElement(
            "h1",
            { id: "confirmationTitle" },
            "Jai Swaminarayan! Thank you for your RSVP. See you on August 29, 2026."
          )
        )
      )
    );
  }

  return React.createElement(
    "main",
    { className: "page" },
    React.createElement(
      "section",
      { className: "form-card", "aria-labelledby": "formTitle" },
      React.createElement(
        "header",
        { className: "form-header" },
        React.createElement("img", {
          className: "logo",
          src: "./HIRES_AMLOGO_color_sm.png",
          alt: "Allentown Mandir",
        }),
        React.createElement("p", { className: "eyebrow" }, "RSVP Form"),
        React.createElement("h1", { id: "formTitle" }, "Shravan Mas Samuh Mahapuja"),
        React.createElement("p", { className: "intro" }, "The Mahapuja will begin promptly at 5:00 PM on Saturday, August 29, 2026. Please enter your phone number below to begin.")
      ),
      React.createElement(
        "form",
        { className: "form-body", onSubmit: handleSubmit },
        React.createElement(
          "div",
          { className: "lookup-section" },
          React.createElement(
            "div",
            { className: "phone-combobox" },
            React.createElement(Field, {
              id: "phone",
              label: "Phone number",
              type: "tel",
              inputMode: "numeric",
              value: form.phone,
              onChange: updatePhone,
              onFocus: () => setSuggestOpen(suggestions.length > 0),
              autoComplete: "tel",
              required: true,
              "aria-autocomplete": "list",
              "aria-expanded": suggestOpen,
              "aria-controls": "phoneSuggestions",
            }),
            suggestOpen &&
              React.createElement(
                "div",
                { className: "suggestions", id: "phoneSuggestions", role: "listbox" },
                suggestions.map((suggestion) =>
                  React.createElement(
                    "button",
                    {
                      className: "suggestion",
                      type: "button",
                      role: "option",
                      key: suggestion.phone,
                      onMouseDown: (event) => event.preventDefault(),
                      onClick: () => selectSuggestion(suggestion),
                    },
                    React.createElement("span", null, digitsForDisplay(suggestion.phone)),
                    suggestion.name && React.createElement("small", null, suggestion.name)
                  )
                )
              ),
            !contactsReady &&
              GOOGLE_SCRIPT_URL &&
              phoneDigits.length < 2 &&
              React.createElement("p", { className: "assistive" }, "Preparing phone number matches...")
          ),
          React.createElement(
            "button",
            {
              className: "button button-secondary lookup-button",
              type: "button",
              onClick: handleLookup,
              disabled: lookupState === "loading",
            },
            lookupState === "loading" ? "Looking Up" : "Look Up"
          )
        ),
        lookupState !== "idle" &&
          React.createElement("p", { className: `status ${lookupStatusClass}` }, lookupMessage),
        detailsVisible &&
          React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "section",
              { className: "section details-section" },
              React.createElement("h2", { className: "section-title" }, "Registrant Details"),
              React.createElement(
                "div",
                { className: "field-grid" },
                React.createElement(Field, {
                  id: "name",
                  label: "Name",
                  value: form.name,
                  onChange: (value) => updateField("name", value),
                  autoComplete: "name",
                  required: true,
                }),
                React.createElement(Field, {
                  id: "email",
                  label: "Email",
                  type: "email",
                  value: form.email,
                  onChange: (value) => updateField("email", value),
                  autoComplete: "email",
                }),
                React.createElement(Field, {
                  id: "zipCode",
                  label: "Zip code",
                  inputMode: "numeric",
                  value: form.zipCode,
                  onChange: (value) => updateField("zipCode", value.replace(/[^\d-]/g, "")),
                  autoComplete: "postal-code",
                }),
                React.createElement(Field, {
                  id: "cityState",
                  label: "City, State",
                  value: form.cityState,
                  onChange: (value) => updateField("cityState", value),
                  autoComplete: "address-level2",
                })
              )
            ),
            submitMessage &&
              React.createElement("p", { className: `status ${submitStatusClass}` }, submitMessage),
            React.createElement(
              "div",
              { className: "actions" },
              React.createElement(
                "button",
                {
                  className: "button button-primary",
                  type: "submit",
                  disabled: submitState === "loading" || !canSubmit,
                },
                submitState === "loading" ? "Submitting" : "Submit RSVP"
              )
            )
          )
      )
    )
  );
}

function Field({ id, label, type = "text", value, onChange, required, ...props }) {
  return React.createElement(
    "div",
    { className: "field" },
    React.createElement("label", { htmlFor: id }, label),
    React.createElement("input", {
      id,
      type,
      value,
      onChange: (event) => onChange(event.target.value),
      required,
      ...props,
    })
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
