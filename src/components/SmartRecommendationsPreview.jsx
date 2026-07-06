import { FiTarget } from "react-icons/fi";

export default function SmartRecommendationsPreview({
  recommendations = [],
  title = "Actionable recommendations",
}) {
  if (!recommendations.length) return null;

  return (
    <div className="mpr-smart-recs">
      <div className="mpr-smart-recs-head">
        <FiTarget size={15} />
        <span>{title}</span>
      </div>
      <ol className="mpr-smart-recs-list">
        {recommendations.map((rec) => (
          <li key={rec}>{rec}</li>
        ))}
      </ol>
    </div>
  );
}
