import { useEffect, useState } from "react";
import { FiPlus, FiEdit2, FiTrash2, FiCheck, FiX } from "react-icons/fi";
import { toast } from "react-toastify";
import api from "../../api/api";
import QBLayout from "./QBLayout";
import "./QuestionBank.css";

export default function QBManage() {
  const [tab, setTab] = useState("boards");

  // Data
  const [boards,   setBoards]   = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [units,    setUnits]    = useState([]);
  const [chapters, setChapters] = useState([]);

  // Selected parents for cascading
  const [selBoard,   setSelBoard]   = useState("");
  const [selSubject, setSelSubject] = useState("");
  const [selUnit,    setSelUnit]    = useState("");

  // Create forms
  const [newBoard,         setNewBoard]         = useState("");
  const [newSubjectName,   setNewSubjectName]   = useState("");
  const [newPaperNumbers,  setNewPaperNumbers]  = useState([]);
  const [paperInput,       setPaperInput]       = useState("");
  const [newUnitName,      setNewUnitName]      = useState("");
  const [newChapterName,   setNewChapterName]   = useState("");

  // Edit state
  const [editingId,    setEditingId]    = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingPapers,setEditingPapers]= useState([]);
  const [editPaperInput, setEditPaperInput] = useState("");

  useEffect(() => { loadBoards(); }, []);
  useEffect(() => { if (selBoard)   loadSubjects(selBoard);   }, [selBoard]);
  useEffect(() => { if (selSubject) loadUnits(selSubject);    }, [selSubject]);
  useEffect(() => { if (selUnit)    loadChapters(selUnit);    }, [selUnit]);

  const loadBoards   = async () => { try { const r = await api.get("/qb/boards");                          setBoards(r.data);   } catch { toast.error("Failed to load boards");   } };
  const loadSubjects = async (boardId)   => { try { const r = await api.get(`/qb/subjects?boardId=${boardId}`);     setSubjects(r.data); } catch { toast.error("Failed to load subjects"); } };
  const loadUnits    = async (subjectId) => { try { const r = await api.get(`/qb/units?subjectId=${subjectId}`);    setUnits(r.data);    } catch { toast.error("Failed to load units");    } };
  const loadChapters = async (unitId)    => { try { const r = await api.get(`/qb/chapters?unitId=${unitId}`);       setChapters(r.data); } catch { toast.error("Failed to load chapters"); } };

  // ── CREATE ──────────────────────────────────────────────────────
  const createBoard = async () => {
    if (!newBoard.trim()) return toast.warn("Enter a board name");
    try {
      await api.post("/qb/boards", { name: newBoard.trim() });
      setNewBoard("");
      loadBoards();
      toast.success("Board created");
    } catch (err) { toast.error(err.response?.data?.message || "Failed"); }
  };

  const createSubject = async () => {
    if (!newSubjectName.trim()) return toast.warn("Enter a subject name");
    if (!selBoard) return toast.warn("Select a board first");
    try {
      await api.post("/qb/subjects", { name: newSubjectName.trim(), boardId: selBoard, paperNumbers: newPaperNumbers });
      setNewSubjectName(""); setNewPaperNumbers([]);
      loadSubjects(selBoard);
      toast.success("Subject created");
    } catch (err) { toast.error(err.response?.data?.message || "Failed"); }
  };

  const createUnit = async () => {
    if (!newUnitName.trim()) return toast.warn("Enter a unit name");
    if (!selSubject) return toast.warn("Select a subject first");
    try {
      await api.post("/qb/units", { name: newUnitName.trim(), subjectId: selSubject });
      setNewUnitName("");
      loadUnits(selSubject);
      toast.success("Unit created");
    } catch (err) { toast.error(err.response?.data?.message || "Failed"); }
  };

  const createChapter = async () => {
    if (!newChapterName.trim()) return toast.warn("Enter a chapter name");
    if (!selUnit) return toast.warn("Select a unit first");
    try {
      await api.post("/qb/chapters", { name: newChapterName.trim(), unitId: selUnit });
      setNewChapterName("");
      loadChapters(selUnit);
      toast.success("Chapter created");
    } catch (err) { toast.error(err.response?.data?.message || "Failed"); }
  };

  // ── DELETE ──────────────────────────────────────────────────────
  const deleteItem = async (type, id) => {
    if (!window.confirm(`Delete this ${type}?`)) return;
    try {
      await api.delete(`/qb/${type}s/${id}`);
      toast.success(`${type} deleted`);
      if (type === "board")   loadBoards();
      if (type === "subject") loadSubjects(selBoard);
      if (type === "unit")    loadUnits(selSubject);
      if (type === "chapter") loadChapters(selUnit);
    } catch (err) { toast.error(err.response?.data?.message || "Failed"); }
  };

  // ── EDIT ────────────────────────────────────────────────────────
  const startEdit = (item, type) => {
    setEditingId(item._id);
    setEditingValue(item.name);
    if (type === "subject") setEditingPapers(item.paperNumbers || []);
  };

  const cancelEdit = () => { setEditingId(null); setEditingValue(""); setEditingPapers([]); };

  const saveEdit = async (type, id) => {
    try {
      const body = { name: editingValue };
      if (type === "subject") body.paperNumbers = editingPapers;
      await api.put(`/qb/${type}s/${id}`, body);
      cancelEdit();
      toast.success("Updated");
      if (type === "board")   loadBoards();
      if (type === "subject") loadSubjects(selBoard);
      if (type === "unit")    loadUnits(selSubject);
      if (type === "chapter") loadChapters(selUnit);
    } catch (err) { toast.error(err.response?.data?.message || "Failed"); }
  };

  // ── PAPER NUMBER HELPERS ────────────────────────────────────────
  const addPaper = () => {
    const val = paperInput.trim();
    if (!val || newPaperNumbers.includes(val)) return;
    setNewPaperNumbers(p => [...p, val]);
    setPaperInput("");
  };

  const addEditPaper = () => {
    const val = editPaperInput.trim();
    if (!val || editingPapers.includes(val)) return;
    setEditingPapers(p => [...p, val]);
    setEditPaperInput("");
  };

  // ── RENDER HELPERS ──────────────────────────────────────────────
  const renderList = (items, type) => (
    <div className="qb-list">
      {items.length === 0 && <p className="qb-empty">No {type}s yet</p>}
      {items.map(item => (
        <div key={item._id} className="qb-list-item">
          {editingId === item._id ? (
            <>
              <div style={{ flex: 1 }}>
                <input
                  className="qb-edit-input"
                  value={editingValue}
                  onChange={e => setEditingValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveEdit(type, item._id)}
                  autoFocus
                />
                {type === "subject" && (
                  <div style={{ marginTop: 8 }}>
                    <div className="qb-tags">
                      {editingPapers.map(p => (
                        <span key={p} className="qb-tag">
                          {p}
                          <span className="qb-tag-remove" onClick={() => setEditingPapers(arr => arr.filter(x => x !== p))}>×</span>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <input
                        className="qb-edit-input"
                        placeholder="Add paper number"
                        value={editPaperInput}
                        onChange={e => setEditPaperInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addEditPaper()}
                        style={{ minWidth: 140 }}
                      />
                      <button className="qb-btn qb-btn--ghost" onClick={addEditPaper}>Add</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="qb-list-item-actions">
                <button className="qb-btn qb-btn--primary" onClick={() => saveEdit(type, item._id)}><FiCheck size={13} /></button>
                <button className="qb-btn qb-btn--ghost"   onClick={cancelEdit}><FiX size={13} /></button>
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: 1 }}>
                <span className="qb-list-item-name">{item.name}</span>
                {type === "subject" && item.paperNumbers?.length > 0 && (
                  <div className="qb-paper-tags" style={{ marginTop: 6 }}>
                    {item.paperNumbers.map(p => (
                      <span key={p} className="qb-paper-tag" style={{ cursor: "default" }}>Paper {p}</span>
                    ))}
                  </div>
                )}
                {type === "subject" && item.boardId?.name && (
                  <span className="qb-list-item-meta"> · {item.boardId.name}</span>
                )}
              </div>
              <div className="qb-list-item-actions">
                <button className="qb-btn qb-btn--ghost"   onClick={() => startEdit(item, type)}><FiEdit2 size={13} /></button>
                <button className="qb-btn qb-btn--danger"  onClick={() => deleteItem(type, item._id)}><FiTrash2 size={13} /></button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <QBLayout title="Manage" subtitle="Create and manage boards, subjects, units and chapters">

      {/* TABS */}
      <div className="qb-tabs">
        {["boards","subjects","units","chapters"].map(t => (
          <button key={t} className={`qb-tab ${tab === t ? "qb-tab--active" : ""}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── BOARDS ── */}
      {tab === "boards" && (
        <div className="qb-panel">
          <div className="qb-panel-title">📋 Boards</div>
          <div className="qb-form-row">
            <div className="qb-form-group">
              <label className="qb-label">Board Name</label>
              <input className="qb-input" placeholder="e.g. Cambridge" value={newBoard} onChange={e => setNewBoard(e.target.value)} onKeyDown={e => e.key === "Enter" && createBoard()} />
            </div>
            <button className="qb-btn qb-btn--primary" onClick={createBoard}><FiPlus size={14} /> Add Board</button>
          </div>
          {renderList(boards, "board")}
        </div>
      )}

      {/* ── SUBJECTS ── */}
      {tab === "subjects" && (
        <div className="qb-panel">
          <div className="qb-panel-title">📚 Subjects</div>
          <div className="qb-form-row">
            <div className="qb-form-group">
              <label className="qb-label">Board</label>
              <select className="qb-select" value={selBoard} onChange={e => { setSelBoard(e.target.value); setSubjects([]); }}>
                <option value="">Select board</option>
                {boards.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <div className="qb-form-group">
              <label className="qb-label">Subject Name</label>
              <input className="qb-input" placeholder="e.g. Physics" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} />
            </div>
          </div>
          <div className="qb-form-row" style={{ marginTop: 12 }}>
            <div className="qb-form-group">
              <label className="qb-label">Paper Numbers</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="qb-input"
                  placeholder="e.g. 4 then press Add"
                  value={paperInput}
                  onChange={e => setPaperInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addPaper()}
                />
                <button className="qb-btn qb-btn--ghost" onClick={addPaper}>Add</button>
              </div>
              {newPaperNumbers.length > 0 && (
                <div className="qb-tags" style={{ marginTop: 8 }}>
                  {newPaperNumbers.map(p => (
                    <span key={p} className="qb-tag">
                      Paper {p}
                      <span className="qb-tag-remove" onClick={() => setNewPaperNumbers(arr => arr.filter(x => x !== p))}>×</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button className="qb-btn qb-btn--primary" style={{ alignSelf: "flex-start", marginTop: 22 }} onClick={createSubject}>
              <FiPlus size={14} /> Add Subject
            </button>
          </div>
          {selBoard && renderList(subjects, "subject")}
          {!selBoard && <p className="qb-empty">Select a board to view subjects</p>}
        </div>
      )}

      {/* ── UNITS ── */}
      {tab === "units" && (
        <div className="qb-panel">
          <div className="qb-panel-title">🗂️ Units</div>
          <div className="qb-form-row">
            <div className="qb-form-group">
              <label className="qb-label">Board</label>
              <select className="qb-select" value={selBoard} onChange={e => { setSelBoard(e.target.value); setSelSubject(""); setSubjects([]); setUnits([]); }}>
                <option value="">Select board</option>
                {boards.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <div className="qb-form-group">
              <label className="qb-label">Subject</label>
              <select className="qb-select" value={selSubject} onChange={e => { setSelSubject(e.target.value); setUnits([]); }} disabled={!selBoard}>
                <option value="">Select subject</option>
                {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div className="qb-form-group">
              <label className="qb-label">Unit Name</label>
              <input className="qb-input" placeholder="e.g. Unit 1 - Motion" value={newUnitName} onChange={e => setNewUnitName(e.target.value)} disabled={!selSubject} />
            </div>
            <button className="qb-btn qb-btn--primary" style={{ alignSelf: "flex-end" }} onClick={createUnit} disabled={!selSubject}>
              <FiPlus size={14} /> Add Unit
            </button>
          </div>
          {selSubject && renderList(units, "unit")}
          {!selSubject && <p className="qb-empty">Select a board and subject to view units</p>}
        </div>
      )}

      {/* ── CHAPTERS ── */}
      {tab === "chapters" && (
        <div className="qb-panel">
          <div className="qb-panel-title">📖 Chapters</div>
          <div className="qb-form-row">
            <div className="qb-form-group">
              <label className="qb-label">Board</label>
              <select className="qb-select" value={selBoard} onChange={e => { setSelBoard(e.target.value); setSelSubject(""); setSelUnit(""); setSubjects([]); setUnits([]); setChapters([]); }}>
                <option value="">Select board</option>
                {boards.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <div className="qb-form-group">
              <label className="qb-label">Subject</label>
              <select className="qb-select" value={selSubject} onChange={e => { setSelSubject(e.target.value); setSelUnit(""); setUnits([]); setChapters([]); }} disabled={!selBoard}>
                <option value="">Select subject</option>
                {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div className="qb-form-group">
              <label className="qb-label">Unit</label>
              <select className="qb-select" value={selUnit} onChange={e => { setSelUnit(e.target.value); setChapters([]); }} disabled={!selSubject}>
                <option value="">Select unit</option>
                {units.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </div>
            <div className="qb-form-group">
              <label className="qb-label">Chapter Name</label>
              <input className="qb-input" placeholder="e.g. Speed and Acceleration" value={newChapterName} onChange={e => setNewChapterName(e.target.value)} disabled={!selUnit} />
            </div>
            <button className="qb-btn qb-btn--primary" style={{ alignSelf: "flex-end" }} onClick={createChapter} disabled={!selUnit}>
              <FiPlus size={14} /> Add
            </button>
          </div>
          {selUnit && renderList(chapters, "chapter")}
          {!selUnit && <p className="qb-empty">Select board → subject → unit to view chapters</p>}
        </div>
      )}

    </QBLayout>
  );
}