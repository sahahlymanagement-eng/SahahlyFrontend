import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import * as swApi from "../../api/scheduledWhatsapp";
import { swErr } from "../../api/scheduledWhatsapp";
import usePersistedState from "../../hooks/usePersistedState";
import GroupsPanel from "../../components/whatsappScheduler/GroupsPanel";
import ScheduleComposer from "../../components/whatsappScheduler/ScheduleComposer";
import ScheduledMessagesTable from "../../components/whatsappScheduler/ScheduledMessagesTable";
import {
  buildPayload,
  emptyForm,
  formFromMessage,
  validateForm,
} from "../../components/whatsappScheduler/recurrence";
import "../../components/whatsappScheduler/whatsappScheduler.css";

// Statuses flip in the background as the server-side cron fires, so the table
// re-reads itself on a slow timer rather than waiting for a manual refresh.
const REFRESH_MS = 45000;

export default function ManagerWhatsAppScheduler() {
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [statusFilter, setStatusFilter] = usePersistedState("mws:status", "");
  const [groupFilter, setGroupFilter] = usePersistedState("mws:group", "");

  // Accepts a plain patch or `prev => patch`. The functional form matters for
  // fields derived from their own previous value (the day toggles): several
  // clicks in one batch would otherwise each read the same stale render and
  // the last one would win.
  const patchForm = useCallback((patch) => {
    setForm((prev) => ({
      ...prev,
      ...(typeof patch === "function" ? patch(prev) : patch),
    }));
  }, []);

  // Inactive groups stay listed in the panel so they can be seen and cleaned
  // up; only active ones are offered as send targets.
  const activeGroups = useMemo(
    () => groups.filter((g) => g.active !== false),
    [groups]
  );

  // Fetchers are pure — they return data and never touch state. That keeps the
  // effects below free of synchronous setState, and lets each caller decide
  // whether a late response still matters.
  const fetchMessages = useCallback(() => {
    const filters = {};
    if (statusFilter) filters.status = statusFilter;
    if (groupFilter) filters.chatId = groupFilter;
    return swApi.listSchedules(filters);
  }, [statusFilter, groupFilter]);

  // Reloads triggered by a user action (mutations, the refresh button).
  const loadGroups = useCallback(async () => {
    try {
      setGroups(await swApi.listGroups());
    } catch (err) {
      toast.error(swErr(err, "Failed to load WhatsApp groups"));
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const loadMessages = useCallback(
    async ({ silent = false } = {}) => {
      try {
        setMessages(await fetchMessages());
      } catch (err) {
        if (!silent) toast.error(swErr(err, "Failed to load scheduled messages"));
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    [fetchMessages]
  );

  // Re-filtering keeps the previous rows on screen while the new set loads, so
  // the spinner only appears when there is nothing to show yet.
  const applyStatusFilter = (value) => {
    setLoadingMessages(messages.length === 0);
    setStatusFilter(value);
  };

  const applyGroupFilter = (value) => {
    setLoadingMessages(messages.length === 0);
    setGroupFilter(value);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await swApi.listGroups();
        if (alive) setGroups(list);
      } catch (err) {
        if (alive) toast.error(swErr(err, "Failed to load WhatsApp groups"));
      } finally {
        if (alive) setLoadingGroups(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // `alive` also drops a superseded response: flip two filters quickly and the
  // slower first request must not overwrite the newer list.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchMessages();
        if (alive) setMessages(list);
      } catch (err) {
        if (alive) toast.error(swErr(err, "Failed to load scheduled messages"));
      } finally {
        if (alive) setLoadingMessages(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchMessages]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) loadMessages({ silent: true });
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadMessages]);

  /* ── Groups ──────────────────────────────────────────────────────────── */

  const handleAddGroup = async (chatId, name) => {
    setBusy(true);
    try {
      const group = await swApi.addGroup(chatId, name);
      await loadGroups();
      // Adding a group is almost always the prelude to sending to it.
      patchForm({ chatId: group?.chatId || chatId });
      toast.success(`Added ${group?.name?.trim() || group?.chatId || chatId}`);
      return true;
    } catch (err) {
      toast.error(swErr(err, "Failed to add group"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGroup = async (chatId) => {
    setBusy(true);
    try {
      await swApi.deleteGroup(chatId);
      await loadGroups();
      if (form.chatId === chatId) patchForm({ chatId: "" });
      if (groupFilter === chatId) setGroupFilter("");
      toast.success("Group removed");
    } catch (err) {
      toast.error(swErr(err, "Failed to remove group"));
    } finally {
      setBusy(false);
    }
  };

  /* ── Composer ────────────────────────────────────────────────────────── */

  const resetComposer = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const problem = validateForm(form);
    if (problem) {
      toast.warn(problem);
      return;
    }

    setBusy(true);
    try {
      const payload = buildPayload(form);
      const saved = editing
        ? await swApi.updateSchedule(editing._id, payload)
        : await swApi.createSchedule(payload);

      resetComposer();
      await loadMessages();

      toast.success(
        saved?.nextRunAt
          ? `Next send: ${new Date(saved.nextRunAt).toLocaleString()}`
          : editing
            ? "Schedule updated"
            : "Message scheduled"
      );
    } catch (err) {
      toast.error(swErr(err, editing ? "Failed to update schedule" : "Failed to schedule message"));
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (msg) => {
    setEditing(msg);
    setForm(formFromMessage(msg));
    document
      .getElementById("mws-composer")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ── Row actions ─────────────────────────────────────────────────────── */

  const handleCancel = async (msg) => {
    setBusy(true);
    try {
      await swApi.cancelSchedule(msg._id);
      await loadMessages();
      toast.success("Schedule cancelled");
    } catch (err) {
      toast.error(swErr(err, "Failed to cancel schedule"));
    } finally {
      setBusy(false);
    }
  };

  const handleSendNow = async (msg) => {
    setBusy(true);
    try {
      const res = await swApi.sendNow(msg._id);
      await loadMessages();
      // `skipped` means the server declined to fire — not a success.
      if (res?.skipped) toast.info("Send skipped by the server");
      else if (res?.ok) toast.success("Sent to WhatsApp");
      else toast.error("Send did not complete");
    } catch (err) {
      toast.error(swErr(err, "Failed to send message"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (msg) => {
    setBusy(true);
    try {
      await swApi.deleteSchedule(msg._id);
      if (editing?._id === msg._id) resetComposer();
      await loadMessages();
      toast.success("Scheduled message deleted");
    } catch (err) {
      toast.error(swErr(err, "Failed to delete scheduled message"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ast-page mws-page">
      <header className="mws-page-header">
        <h1 className="mws-page-title">WhatsApp Scheduler</h1>
        <p className="mws-page-subtitle">
          Queue a message to a WhatsApp group — once, or on a repeating schedule.
        </p>
      </header>

      <GroupsPanel
        groups={groups}
        loading={loadingGroups}
        busy={busy}
        onAdd={handleAddGroup}
        onDelete={handleDeleteGroup}
      />

      <ScheduleComposer
        form={form}
        onPatch={patchForm}
        groups={activeGroups}
        editing={editing}
        busy={busy}
        onSubmit={handleSubmit}
        onCancelEdit={resetComposer}
      />

      <ScheduledMessagesTable
        messages={messages}
        groups={groups}
        loading={loadingMessages}
        busy={busy}
        statusFilter={statusFilter}
        groupFilter={groupFilter}
        onStatusFilter={applyStatusFilter}
        onGroupFilter={applyGroupFilter}
        onRefresh={() => loadMessages()}
        onEdit={handleEdit}
        onCancel={handleCancel}
        onSendNow={handleSendNow}
        onDelete={handleDelete}
      />
    </div>
  );
}
