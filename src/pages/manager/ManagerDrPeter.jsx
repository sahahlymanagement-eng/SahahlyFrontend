import GradingProviderPage from "./GradingProviderPage";

// Dr Peter's tab. He is a second teacher on the SAME partner platform as
// Mariam Gabalawy — same base URL — so what separates the two tabs is the
// webhook key the partner sends with each assignment: that key resolves to the
// backend provider slug "drpeter", which has its own collections. Nothing here
// filters Mariam's submissions out; they were never in Peter's collection.
export default function ManagerDrPeter() {
  return <GradingProviderPage slug="drpeter" label="Dr Peter" />;
}
