import GradingProviderPage from "./GradingProviderPage";

// Dr Mariam El Gabalawy's tab. Submissions land here when the partner sends
// them with her webhook key (backend provider slug "mariamgabalawy").
export default function ManagerMariamGabalawy() {
  return <GradingProviderPage slug="mariamgabalawy" label="Mariam Gabalawy" />;
}
