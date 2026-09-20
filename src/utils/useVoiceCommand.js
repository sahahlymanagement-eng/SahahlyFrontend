import { useCallback, useRef, useState } from "react";

/**
 * Push-to-talk voice command recorder: click to start, click again to stop.
 * Records with MediaRecorder and hands the finished blob to `transcribe`
 * (a (Blob) => Promise<string> function backed by a server-side OpenAI
 * transcription endpoint — browser speech APIs are Chrome-only and struggle
 * with mixed Arabic/English school names, so we don't use those).
 */
export function useVoiceCommand(transcribe, onTranscribed) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const start = useCallback(async () => {
    setMicError(null);
    if (recording || transcribing) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("Voice input isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const text = await transcribe(blob);
          if (text && text.trim()) {
            onTranscribed(text.trim());
          } else {
            setMicError("Didn't catch that — please try again.");
          }
        } catch (err) {
          setMicError(
            err.response?.data?.message || err.message || "Voice transcription failed."
          );
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setMicError("Microphone access was denied.");
    }
  }, [recording, transcribing, transcribe, onTranscribed]);

  const stop = useCallback(() => {
    if (recorderRef.current && recording) {
      recorderRef.current.stop();
      setRecording(false);
    }
  }, [recording]);

  const toggle = useCallback(() => {
    if (recording) stop();
    else start();
  }, [recording, start, stop]);

  return { recording, transcribing, micError, toggle };
}
