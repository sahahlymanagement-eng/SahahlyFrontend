import { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { selectStyles } from "../utils/selectTheme";
import { listGroups } from "../api/scheduledWhatsapp";
import "./WhatsAppDestinationPicker.css";

const TYPE_OPTIONS = [
  { value: "group", label: "WhatsApp group" },
  { value: "phone", label: "Phone number" },
];

/**
 * Controlled picker for a WhatsApp destination: an existing registered group
 * (same registry as the WhatsApp scheduler) or a raw phone number. Emits
 * { destinationType, destinationValue, destinationLabel } via onChange.
 */
export default function WhatsAppDestinationPicker({ value, onChange, disabled }) {
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  useEffect(() => {
    let alive = true;
    listGroups({ active: true })
      .then((rows) => {
        if (alive) setGroups(rows);
      })
      .finally(() => {
        if (alive) setLoadingGroups(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const groupOptions = useMemo(
    () => groups.map((g) => ({ value: g.chatId, label: g.name || g.chatId })),
    [groups]
  );

  const destinationType = value?.destinationType || "group";

  const selectedGroup =
    groupOptions.find((o) => o.value === value?.destinationValue) ||
    (destinationType === "group" && value?.destinationValue
      ? { value: value.destinationValue, label: value.destinationValue }
      : null);

  return (
    <div className="wadp">
      <label className="wadp-field">
        <span className="wadp-label">Destination type</span>
        <Select
          styles={selectStyles}
          menuPortalTarget={document.body}
          options={TYPE_OPTIONS}
          value={TYPE_OPTIONS.find((o) => o.value === destinationType)}
          onChange={(sel) =>
            onChange({ destinationType: sel.value, destinationValue: "", destinationLabel: "" })
          }
          isDisabled={disabled}
        />
      </label>

      {destinationType === "group" ? (
        <label className="wadp-field">
          <span className="wadp-label">Group</span>
          <Select
            styles={selectStyles}
            menuPortalTarget={document.body}
            options={groupOptions}
            value={selectedGroup}
            onChange={(sel) =>
              onChange({
                destinationType: "group",
                destinationValue: sel?.value || "",
                destinationLabel: sel?.label || "",
              })
            }
            placeholder="Select a group…"
            isDisabled={disabled}
            noOptionsMessage={() => (loadingGroups ? "Loading groups…" : "No groups registered yet")}
          />
        </label>
      ) : (
        <label className="wadp-field">
          <span className="wadp-label">Phone number</span>
          <PhoneInput
            defaultCountry="eg"
            value={value?.destinationValue ? `+${value.destinationValue}` : ""}
            onChange={(phone) => {
              const digits = phone.replace(/\D/g, "");
              onChange({
                destinationType: "phone",
                destinationValue: digits,
                destinationLabel: digits ? `+${digits}` : "",
              });
            }}
            disabled={disabled}
            className="tm-phone-input"
            countrySelectorStyleProps={{
              dropdownStyleProps: { style: { maxHeight: "350px", zIndex: 9999 } },
            }}
          />
        </label>
      )}
    </div>
  );
}
