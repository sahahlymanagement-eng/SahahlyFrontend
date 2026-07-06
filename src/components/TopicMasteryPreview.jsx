function barTone(score) {
  if (score >= 75) return "green";
  if (score >= 60) return "orange";
  return "red";
}

export default function TopicMasteryPreview({ topics = [], title = "Topic mastery" }) {
  if (!topics.length) return null;

  return (
    <div className="mpr-topic-mastery">
      <p className="mpr-topic-mastery-title">{title}</p>
      <ul className="mpr-topic-bars">
        {topics.map((t) => (
          <li key={t.topic} className="mpr-topic-bar-row">
            <div className="mpr-topic-bar-head">
              <span>{t.topic}</span>
              <strong>{t.score != null ? `${t.score}%` : "—"}</strong>
            </div>
            <div className="mpr-topic-bar-track">
              <div
                className={`mpr-topic-bar-fill mpr-topic-bar-fill--${barTone(t.score)}`}
                style={{ width: `${t.score ?? 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
