import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/api";
import { toast } from "react-toastify";

// The prompt lives in two different id spaces.
//
// Classroom assignments have an Assignment document, so the prompt is a field on
// it and /api/marking/assignment-prompt/:id is keyed by a Mongo ObjectId.
//
// Grading-partner assignments (LoginCSS, Mariam Gabalawy, Dr Peter) have no
// Assignment document — they arrive inline on each submission, keyed by the
// partner's own numeric id — so the marking routes reject them outright with
// "Assignment not found". Their prompt lives on the provider's per-assignment
// settings document instead, behind the provider-scoped routes below. The
// provider segment is load-bearing: two partners can both have an assignment 42.
//
// Mirrors gradingSettingsPath() in useGradingAssignmentSettings.js —
// `provider` null/undefined means LoginCSS, which keeps its own /external-grading
// routes; any slug goes through the shared /grading/:provider registry.
export function assignmentPromptPath({ grading, provider, assignmentId }) {
  if (!grading) return `/marking/assignment-prompt/${assignmentId}`;
  return provider
    ? `/grading/${provider}/assignments/${assignmentId}/prompt`
    : `/external-grading/assignments/${assignmentId}/prompt`;
}

/**
 * @param {string|number|null} assignmentId
 * @param {object} [options]
 * @param {boolean} [options.grading]  true for a grading-partner assignment
 * @param {string|null} [options.provider]  partner slug; null = LoginCSS
 */
export function useAssignmentMarkingPrompt(assignmentId, options) {
  const grading = Boolean(options?.grading);
  const provider = options?.provider ?? null;

  const basePath = useMemo(
    () => (assignmentId == null ? null : assignmentPromptPath({ grading, provider, assignmentId })),
    [grading, provider, assignmentId]
  );
  return usePromptState({
    assignmentId,
    basePath,
    // Both route families hang generate off their own base, so this is the same
    // suffix either way.
    generatePath: basePath ? `${basePath}/generate` : null,
  });
}

function usePromptState({ assignmentId, basePath, generatePath }) {
  const [content, setContent] = useState("");
  const [maxPoints, setMaxPoints] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!basePath) {
      setContent("");
      setMaxPoints(null);
      setGeneratedAt(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(basePath);
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
  }, [basePath]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = useCallback(async (masterPrompt = "") => {
    if (!generatePath) return null;
    setGenerating(true);
    try {
      const res = await api.post(generatePath, {
        masterPrompt: String(masterPrompt || "").trim(),
      });
      setContent(res.data?.content || "");
      setMaxPoints(res.data?.maxPoints ?? null);
      setGeneratedAt(res.data?.generatedAt || new Date().toISOString());
      const lm = res.data?.labelMapping;
      let detail = "";
      if (lm?.applied && lm.count > 0) {
        detail = ` — ${lm.count} printed→MS label mapping${lm.count === 1 ? "" : "s"} added automatically`;
      } else if (lm?.count > 0) {
        detail = ` — ${lm.count} label mapping${lm.count === 1 ? "" : "s"} in prompt`;
      } else if (
        lm?.reason === "no_page_local_renumbering" ||
        lm?.reason === "sequence_table_labels_match_ms" ||
        lm?.reason === "no_renumbering_declared_in_main_prompt"
      ) {
        detail = " — no page-local renumbering (mapping not needed)";
      }
      toast.success(`Assignment prompt generated${detail}`);
      return res.data;
    } catch (err) {
      toast.error(err.response?.data?.message || "Prompt generation failed");
      throw err;
    } finally {
      setGenerating(false);
    }
  }, [generatePath]);

  const save = useCallback(
    async (nextContent) => {
      if (!basePath) return null;
      const text = String(nextContent ?? content).trim();
      if (!text) {
        toast.warn("Prompt cannot be empty");
        return null;
      }
      setSaving(true);
      try {
        const res = await api.put(basePath, {
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
    [basePath, content, generatedAt, maxPoints]
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
