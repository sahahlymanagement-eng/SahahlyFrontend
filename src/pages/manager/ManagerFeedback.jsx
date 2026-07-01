import FeedbackView from "../../components/FeedbackView";
import "../manager/ManagerFeedback.css";

export default function ManagerFeedback() {
  return <FeedbackView apiBase="/manager-feedback" scope="manager" />;
}
