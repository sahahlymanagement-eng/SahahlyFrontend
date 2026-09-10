import GradingProviderPage from "./GradingProviderPage";
import DrPeterIndexingTools from "../../components/DrPeterIndexingTools";

export default function ManagerDrPeterIndexing() {
  return <GradingProviderPage slug="drpeter" label="Dr Peter — Indexing" workflowKey="drpeter-indexing" AssignmentTools={DrPeterIndexingTools} />;
}
