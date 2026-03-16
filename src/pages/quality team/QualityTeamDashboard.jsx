import { useEffect, useState } from "react";
import api from "../../api/api";
import "./QualityTeamDashboard.css";

export default function QualityTeamDashboard() {

  const [personId, setPersonId] = useState("");
  const [delegations, setDelegations] = useState([]);
  const [selected, setSelected] = useState(null);

  const [checklistItems, setChecklistItems] = useState([]);
  const [selectedLevels, setSelectedLevels] = useState({});
  const [totalScore, setTotalScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);

  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");

  const [classroomTeacherMap, setClassroomTeacherMap] = useState({});
  const [classroomNameMap, setClassroomNameMap] = useState({});

  /* ================= PAGE LOAD ================= */

  useEffect(() => {

    const user = JSON.parse(localStorage.getItem("user"));

    if (user) {
      setPersonId(user.id);
      loadAssignments(user.id);
    }

    loadChecklistItems();
    loadClassrooms();

  }, []);

  /* ================= LOAD CLASSROOMS ================= */

  const loadClassrooms = async () => {

    const res = await api.get("/classrooms");

    const teacherMap = {};
    const nameMap = {};

    res.data.forEach((c) => {

      nameMap[c._id] = c.name;

      teacherMap[c._id] = c.teacherId?.name || "Not Assigned";

    });

    setClassroomTeacherMap(teacherMap);
    setClassroomNameMap(nameMap);

  };

  /* ================= LOAD CHECKLIST ================= */

  const loadChecklistItems = async () => {

    const res = await api.get("/quality-checklist-items", {
      params: { activeOnly: true }
    });

    const items = res.data || [];

    setChecklistItems(items);

    const totalMax = items.reduce((sum, item) => sum + item.fullScore, 0);

    setMaxScore(totalMax);

  };

  /* ================= LOAD ASSIGNMENTS ================= */

  const loadAssignments = async (id) => {

    const res = await api.get("/assignment-delegations", {
      params: {
        personId: id,
        role: "quality team"
      }
    });

    setDelegations(res.data || []);

  };

  /* ================= SCORE ================= */

  const selectScore = (item, level) => {

    const updated = {
      ...selectedLevels,
      [item._id]: level
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

    setMessage("Marked as DONE");

    setSelected(null);

    loadAssignments(personId);

  };

  const markDoneLate = async () => {

    await api.post(
      `/assignment-workflow/quality-team/${selected.assignmentId._id}/done-late`,
      { personId }
    );

    setMessage("Marked as DONE_BY_QUALITY_LATE");

    setSelected(null);

    loadAssignments(personId);

  };

  const markDoneByQuality = async () => {

    await api.post(
      `/assignment-workflow/quality-team/${selected.assignmentId._id}/done-by-quality`,
      { personId }
    );

    setMessage("Resolved by Quality Team");

    setSelected(null);

    loadAssignments(personId);

  };

  const sendBack = async () => {

    const itemsPayload = checklistItems.map((item) => ({
      checklistItemId: item._id,
      selected: selectedLevels[item._id] || "zero"
    }));

    await api.post(
      `/assignment-workflow/quality-team/${selected.assignmentId._id}/recheck`,
      {
        personId,
        comment,
        items: itemsPayload
      }
    );

    setMessage("Sent back to assistant");

    setSelected(null);

    loadAssignments(personId);

  };

  const formatDateTime = (date) => {
  const d = new Date(date);

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  const time = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${day}/${month}/${year} ${time}`;
};

  /* ================= UI ================= */

  return (

    <div className="qualityLayout">

      <div className="qualityContainer">

        <h2 className="pageTitle">
          Quality Team Dashboard
        </h2>

        <div className="assignmentTableWrapper">

          <table className="assignmentTable">

            <thead>
              <tr>
                <th>Classroom</th>
                <th>Teacher</th>
                <th>Assignment</th>
                <th>Status</th>
                <th>Quality Deadline</th>
                <th>Open</th>
              </tr>
            </thead>

            <tbody>

              {delegations
                .filter((d) =>
                  ["IN_REVIEW", "IN_REVIEW_AFTER_RECHECK", "EMERGENCY"]
                    .includes(d.assignmentId?.status)
                )
                .map((d) => {

                  const classroomId = d.assignmentId?.classroomId;

                  return (

                    <tr key={d._id}>

                      <td>
                        {classroomNameMap[classroomId] || "Unknown"}
                      </td>

                      <td>
                        {classroomTeacherMap[classroomId] || "Not Assigned"}
                      </td>

                      <td>
                        {d.assignmentId.title}
                      </td>

                      <td>
                        <span className={`status ${d.assignmentId.status}`}>
                          {d.assignmentId.status}
                        </span>
                      </td>
                      <td>
                        {d.qualityDeadline
                          ? formatDateTime(d.qualityDeadline)
                          : "Not Set"}
                      </td>

                      <td>

                        <button
                          className="openBtn"
                          onClick={() => setSelected(d)}
                        >
                          Open
                        </button>

                      </td>

                    </tr>

                  );

                })}

            </tbody>

          </table>

        </div>

        {/* REVIEW PANEL */}

        {selected && (

          <div className="reviewPanel">

            <h3>{selected.assignmentId.title}</h3>

            <p className="reviewStatus">
              Status: {selected.assignmentId.status}
            </p>

            {selected.assignmentId.status !== "EMERGENCY" && (

              <>

                <table className="checklistTable">

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

                        <td>{item.title}</td>

                        <td>
                          <input
                            type="radio"
                            name={item._id}
                            onChange={() => selectScore(item, "zero")}
                          />
                        </td>

                        <td>
                          <input
                            type="radio"
                            name={item._id}
                            onChange={() => selectScore(item, "partial")}
                          />
                        </td>

                        <td>
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

                <div className="scoreBox">
                  Total Score: {totalScore} / {maxScore}
                </div>

                <textarea
                  className="commentBox"
                  placeholder="Comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />

              </>

            )}

            <div className="actionButtons">

              {selected.assignmentId.status === "IN_REVIEW" && (

                <button
                  className="successBtn"
                  onClick={markDone}
                >
                  Mark Done
                </button>

              )}

              {selected.assignmentId.status === "IN_REVIEW_AFTER_RECHECK" && (

                <>
                  <button
                    className="successBtn"
                    onClick={markDone}
                  >
                    Mark Done
                  </button>

                  <button
                    className="warningBtn"
                    onClick={markDoneByQuality}
                  >
                    Resolve by Quality
                  </button>
                </>

              )}

              {selected.assignmentId.status === "EMERGENCY" && (

                <button
                  className="dangerBtn"
                  onClick={markDoneLate}
                >
                  Done Late
                </button>

              )}

              {selected.assignmentId.status !== "EMERGENCY" && (

                <button
                  className="sendBackBtn"
                  onClick={sendBack}
                >
                  Send Back
                </button>

              )}

            </div>

          </div>

        )}

        {message && (
          <div className="messageBox">
            {message}
          </div>
        )}

      </div>

    </div>

  );

}