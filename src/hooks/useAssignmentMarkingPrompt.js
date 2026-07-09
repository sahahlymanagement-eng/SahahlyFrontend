import { useCallback, useEffect, useState } from "react";
import api from "../api/api";
import { toast } from "react-toastify";

export function useAssignmentMarkingPrompt(assignmentId) {
  const [content, setContent] = useState("");
  const [maxPoints, setMaxPoints] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!assignmentId) {
      setContent("");
      setMaxPoints(null);
      setGeneratedAt(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/marking/assignment-prompt/${assignmentId}`);
      setContent(res.data?.content || "");
      setMaxPoints(res.data?.maxPoints ?? null);
      setGeneratedAt(res.data?.generatedAt || null);
    } catch {
      setContent("");
      setMaxPoints(null);
      setGeneratedAt(null);
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = useCallback(async () => {
    if (!assignmentId) return null;
    setGenerating(true);
    try {
      const res = await api.post(`/marking/assignment-prompt/${assignmentId}/generate`);
      setContent(res.data?.content || "");
      setMaxPoints(res.data?.maxPoints ?? null);
      setGeneratedAt(res.data?.generatedAt || new Date().toISOString());
      toast.success("Assignment prompt generated");
      return res.data;
    } catch (err) {
      toast.error(err.response?.data?.message || "Prompt generation failed");
      throw err;
    } finally {
      setGenerating(false);
    }
  }, [assignmentId]);

  const save = useCallback(
    async (nextContent) => {
      if (!assignmentId) return null;
      const text = String(nextContent ?? content).trim();
      if (!text) {
        toast.warn("Prompt cannot be empty");
        return null;
      }
      setSaving(true);
      try {
        const res = await api.put(`/marking/assignment-prompt/${assignmentId}`, {
          content: text,
        });
        setContent(res.data?.content || text);
        setMaxPoints(res.data?.maxPoints ?? maxPoints);
        setGeneratedAt(res.data?.generatedAt || generatedAt);
        toast.success("Assignment prompt saved");
        return res.data;
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to save prompt");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [assignmentId, content, generatedAt, maxPoints]
  );

  return {
    content,
    setContent,
    maxPoints,
    generatedAt,
    loading,
    generating,
    saving,
    hasPrompt: Boolean(content?.trim()),
    reload: load,
    generate,
    save,
  };
}
