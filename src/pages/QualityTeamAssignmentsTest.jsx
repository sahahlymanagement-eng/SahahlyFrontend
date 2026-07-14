import { useEffect, useState } from "react";
import api from "../api/api";

export default function QualityTeamAssignmentsTest() {
  const [personId, setPersonId] = useState("");
  const [delegations, setDelegations] = useState([]);
  const [selected, setSelected] = useState(null);

  const [checklistItems, setChecklistItems] = useState([]);
  const [selectedLevels, setSelectedLevels] = useState({});
  const [totalScore, setTotalScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);

  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");

  /* ================= LOAD CHECKLIST ================= */

  useEffect(() => {
    loadChecklistItems();
  }, []);

  const loadChecklistItems = async () => {
    const res = await api.get("/quality-checklist-items", {
      params: { activeOnly: true },
    });

    const items = res.data || [];
    setChecklistItems(items);

    const totalMax = items.reduce(
      (sum, item) => sum + item.fullScore,
      0
    );

    setMaxScore(totalMax);
  };

  /* ================= LOAD ASSIGNMENTS ================= */

  const loadAssignments = async () => {
    if (!personId) {
      alert("Enter quality team personId");
      return;
    }

    const res = await api.get("/assignment-delegations", {
      params: {
        personId,
        role: "quality team",
      },
    });

    setDelegations(res.data || []);
  };

  /* ================= SCORE ================= */

  const selectScore = (item, level) => {
    const updated = {
      ...selectedLevels,
      [item._id]: level,
    };

    setSelectedLevels(updated);

    let total = 0;

    checklistItems.forEach((i) => {
      const selectedLevel = updated[i._id];
      if (selectedLevel === "partial") total += i.fullScore / 2;
      if (selectedLevel === "full") total += i.fullScore;
    });

    setTotalScore(total);
  };

  /* ================= RESET ================= */

  useEffect(() => {
    if (selected) {
      setSelectedLevels({});
      setTotalScore(0);
      setComment("");
      setMessage("");
    }
  }, [selected]);

  /* ================= ACTIONS ================= */

  const markDone = async () => {
    await api.post(
      `/assignment-workflow/quality-team/${selected.assignmentId._id}/done`,
      { personId }
    );
    setMessage("✅ Marked as DONE");
    setSelected(null);
    loadAssignments();
  };

  const markDoneLate = async () => {
    await api.post(
      `/assignment-workflow/quality-team/${selected.assignmentId._id}/done-late`,
      { personId }
    );
    setMessage("⚠️ Marked as DONE_BY_QUALITY_LATE");
    setSelected(null);
    loadAssignments();
  };

  const markDoneByQuality = async () => {
    await api.post(
      `/assignment-workflow/quality-team/${selected.assignmentId._id}/done-by-quality`,
      { personId }
    );
    setMessage("🛠 Marked as DONE_BY_QUALITY");
    setSelected(null);
    loadAssignments();
  };

  const sendBack = async () => {
    const itemsPayload = checklistItems.map((item) => ({
      checklistItemId: item._id,
      selected: selectedLevels[item._id] || "zero",
    }));

    await api.post(
      `/assignment-workflow/quality-team/${selected.assignmentId._id}/recheck`,
      {
        personId,
        comment,
        items: itemsPayload,
      }
    );

    setMessage("🔁 Sent back to assistant");
    setSelected(null);
    loadAssignments();
  };

  /* ================= UI ================= */

  return (
    <div style={{ padding: 30 }}>
      <h2>Quality Team Review Panel</h2>

      <input
        placeholder="Quality team personId"
        value={personId}
        onChange={(e) => setPersonId(e.target.value)}
        style={{ width: "100%" }}
      />

      <button onClick={loadAssignments} style={{ marginTop: 10 }}>
        Load My Reviews
      </button>

      <hr />

      <ul>
        {delegations
          .filter((d) =>
            [
              "IN_REVIEW",
              "IN_REVIEW_AFTER_RECHECK",
              "EMERGENCY",
            ].includes(d.assignmentId?.status)
          )
          .map((d) => (
            <li key={d._id}>
              <button onClick={() => setSelected(d)}>
                {d.assignmentId.title} — 
                <strong> {d.assignmentId.status}</strong>
              </button>
            </li>
          ))}
      </ul>

      {selected && (
        <>
          <hr />
          <h3>{selected.assignmentId.title}</h3>
          <p>Status: {selected.assignmentId.status}</p>

          {/* NORMAL REVIEW */}
          {selected.assignmentId.status !== "EMERGENCY" && (
            <>
              <table className="sah-table--cards" border="1" width="100%">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Zero</th>
                    <th>Partial</th>
                    <th>Full</th>
                  </tr>
                </thead>
                <tbody>
                  {checklistItems.map((item) => (
                    <tr key={item._id}>
                      <td data-label="Item">{item.title}</td>
                      <td data-label="Zero">
                        <input
                          type="radio"
                          name={item._id}
                          onChange={() => selectScore(item, "zero")}
                        />
                      </td>
                      <td data-label="Partial">
                        <input
                          type="radio"
                          name={item._id}
                          onChange={() => selectScore(item, "partial")}
                        />
                      </td>
                      <td data-label="Full">
                        <input
                          type="radio"
                          name={item._id}
                          onChange={() => selectScore(item, "full")}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3>Total: {totalScore} / {maxScore}</h3>

              <textarea
                placeholder="Comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{ width: "100%", height: 80 }}
              />
            </>
          )}

          <div style={{ marginTop: 15 }}>
            {/* NORMAL DONE */}
            {selected.assignmentId.status === "IN_REVIEW" && (
              <button onClick={markDone}>✅ Mark Done</button>
            )}

            {/* AFTER RECHECK */}
            {selected.assignmentId.status ===
              "IN_REVIEW_AFTER_RECHECK" && (
              <>
                <button onClick={markDone}>✅ Mark Done</button>

                <button
                  onClick={markDoneByQuality}
                  style={{ marginLeft: 10 }}
                >
                  🛠 Resolve & Done By Quality
                </button>
              </>
            )}

            {/* EMERGENCY */}
            {selected.assignmentId.status === "EMERGENCY" && (
              <button
                onClick={markDoneLate}
                style={{ backgroundColor: "orange" }}
              >
                ⚠️ Done Late by Quality
              </button>
            )}

            {/* SEND BACK */}
            {selected.assignmentId.status !== "EMERGENCY" && (
              <button
                onClick={sendBack}
                style={{ marginLeft: 10 }}
              >
                🔁 Send Back
              </button>
            )}
          </div>
        </>
      )}

      {message && <p>{message}</p>}
    </div>
  );
}
