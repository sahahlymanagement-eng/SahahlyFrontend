import TokenUsageView from "../../components/TokenUsageView";

export default function DirectorTokenUsage() {
  return (
    <div className="tu-embedded">
      <TokenUsageView apiBase="/director-token-usage" scope="director" embedded />
    </div>
  );
}
