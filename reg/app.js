const { useMemo, useState } = React;

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
  const [submitted, setSubmitted] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const phoneDigits = normalizePhone(form.phone);

  const canSubmit = useMemo(() => {
    return (
      detailsVisible &&
      phoneDigits.length === 10 &&
      form.name.trim() &&
      ["Yajman Couple", "Yajman Single"].includes(form.yajmanType) &&
      (!form.whatsappOptIn || form.email.trim())
    );
  }, [detailsVisible, phoneDigits, form]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setSubmitMessage("");
    setSubmitState("idle");
  }

  function updatePhone(value) {
    const digits = normalizePhone(value);
    const matches = filterContacts(contactDatabase.contacts, digits);
    setSuggestions(matches);
    setSuggestOpen(matches.length > 0);
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
        yajmanType: "",
        whatsappOptIn: false,
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
      yajmanType: "",
      whatsappOptIn: false,
    }));
    setLookupMatched(matched);
    setDetailsVisible(true);
    setSuggestOpen(false);
  }

  function selectSuggestion(contact) {
    applyContact(contact, true);
    setLookupState("success");
    setLookupMessage("We found your contact record. Please review it before submitting.");
  }

  function lookupPhone(phoneValue = form.phone) {
    const digits = normalizePhone(phoneValue);
    if (digits.length !== 10) {
      setLookupState("error");
      setLookupMessage("Enter a 10 digit phone number.");
      return;
    }
    setSubmitState("idle");
    setSubmitMessage("");
    setLookupMatched(false);
    setDetailsVisible(false);
    setSuggestions([]);
    setSuggestOpen(false);
    try {
      const data = loadContact(digits);
      if (data.contacts.length > 1) {
        applyContact({ phone: digits }, false);
        setDetailsVisible(false);
        setSuggestions(data.contacts);
        setSuggestOpen(true);
        setLookupState("info");
        setLookupMessage("More than one record uses this number. Please select your name above.");
      } else if (data.found) {
        selectSuggestion(data.contact);
      } else {
        applyContact({ phone: digits }, false);
        setLookupState("info");
        setLookupMessage("That phone number was not found. Please complete the RSVP manually.");
      }
    } catch (error) {
      applyContact({ phone: digits }, false);
      setLookupState("error");
      setLookupMessage(error.message);
    }
  }

  function handleLookup(event) {
    event.preventDefault();
    return lookupPhone();
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
      yajmanType: form.yajmanType,
      whatsappOptIn: form.whatsappOptIn,
      lookupStatus: lookupMatched ? "Matched" : "Manual",
    };

    try {
      const result = await submitRsvp(payload);
      setConfirmation(result);
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
            "Jai Swaminarayan! Thank you for your RSVP. See you on November 6, 2026."
          ),
          confirmation?.whatsappStatus === "queued" && React.createElement("p", { className: "status success" }, "Your confirmation email was sent, and your WhatsApp confirmation has been queued."),
          confirmation?.warning && React.createElement("p", { className: "status info" }, confirmation.warning)
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
        React.createElement("h1", { id: "formTitle" }, "Dhan Teras Puja 2026"),
        React.createElement("p", { className: "intro" }, "The puja will begin promptly at 5:30 PM on Friday, November 6, 2026. Please enter your phone number below to begin.")
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
                      key: suggestion.id,
                      onMouseDown: (event) => event.preventDefault(),
                      onClick: () => selectSuggestion(suggestion),
                    },
                    React.createElement("span", null, digitsForDisplay(suggestion.phone)),
                    suggestion.name && React.createElement("small", null, suggestion.name)
                  )
                )
              ),
            React.createElement("p", { className: "assistive" }, "Enter at least two digits to see matching phone numbers.")
          ),
          React.createElement(
            "button",
            {
              className: "button button-secondary lookup-button",
              type: "button",
              onClick: handleLookup,
            },
            "Look Up"
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
                  required: form.whatsappOptIn,
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
            React.createElement(
              "fieldset",
              { className: "yajman-choice" },
              React.createElement("legend", { className: "legend" }, "Will you be participating as a Yajman Couple or Yajman Single? ", React.createElement("span", { className: "required-asterisk", "aria-hidden": true }, "*")),
              ["Yajman Couple", "Yajman Single"].map((option) =>
                React.createElement(
                  "label",
                  { className: "yajman-option", key: option },
                  React.createElement("input", {
                    type: "radio",
                    name: "yajmanType",
                    value: option,
                    checked: form.yajmanType === option,
                    required: true,
                    onChange: () => updateField("yajmanType", option),
                  }),
                  React.createElement("span", null, option)
                )
              )
            ),
            React.createElement(
              "label",
              { className: "yajman-option whatsapp-option" },
              React.createElement("input", {
                type: "checkbox", name: "whatsappOptIn", checked: form.whatsappOptIn,
                onChange: (event) => updateField("whatsappOptIn", event.target.checked),
              }),
              React.createElement("span", null, "Send me a WhatsApp confirmation at this phone number.")
            ),
            form.whatsappOptIn && React.createElement("p", { className: "assistive" }, "Please provide your email address. Your WhatsApp confirmation will refer to the confirmation email."),
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
