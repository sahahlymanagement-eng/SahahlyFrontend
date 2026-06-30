import TokenUsageView from "../../components/TokenUsageView";
import "./ManagerTokenUsage.css";

export default function ManagerTokenUsage() {
  return (
    <div className="tu-root">
      <TokenUsageView apiBase="/manager-token-usage" scope="manager" />
    </div>
  );
}
