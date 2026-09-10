import GradingProviderPage from "./GradingProviderPage";
import DrPeterIndexingTools from "../../components/DrPeterIndexingTools";

function MariamIndexingTools(props) {
  return <DrPeterIndexingTools {...props} provider="mariamgabalawy" />;
}

// Dr Mariam El Gabalawy's tab. Submissions land here when the partner sends
// them with her webhook key (backend provider slug "mariamgabalawy").
export default function ManagerMariamGabalawy() {
  return <GradingProviderPage slug="mariamgabalawy" label="Mariam Gabalawy" AssignmentTools={MariamIndexingTools} />;
}
