import { Outlet } from "react-router-dom";
import { useMemo } from "react";
import {
  FiHome,
  FiUsers,
  FiRadio,
  FiLayers,
  FiBarChart2,
  FiBookOpen,
  FiUserPlus,
  FiUser,
  FiUserCheck,
  FiMessageSquare,
  FiClipboard,
  FiUploadCloud,
  FiCpu,
  FiTarget,
  FiEdit3,
  FiMessageCircle,
  FiSend,
} from "react-icons/fi";
import { BsPersonBadge } from "react-icons/bs";
import RoleSidebar from "../../components/RoleSidebar";
import RoleShell from "../../components/RoleShell";
import {
  GradingNotificationProvider,
  useGradingNotifications,
} from "../../context/GradingNotificationContext";
import "./directorShell.css";

const GRADING_NAV_PATHS = {
  "/director/mariamgabalawy": "mariamgabalawy",
  "/director/drpeter": "drpeter",
};

function buildNavSections(counts) {
  const partnerBadge = (path) => {
    const slug = GRADING_NAV_PATHS[path];
    const unread = slug ? counts?.[slug]?.ungradedTotal ?? 0 : 0;
    return unread > 0 ? unread : undefined;
  };

  return [
    {
      label: "Overview",
      items: [{ icon: <FiHome />, label: "Dashboard", path: "/director/dashboard" }],
    },
    {
      label: "People & teams",
      items: [
        { icon: <FiUsers />, label: "People", path: "/director/people" },
        { icon: <FiLayers />, label: "Classroom Managers", path: "/director/classroommanagers" },
        { icon: <FiUserPlus />, label: "Create Teachers", path: "/director/manage-teachers" },
        { icon: <FiUser />, label: "Teachers", path: "/director/teachers" },
        { icon: <FiUserCheck />, label: "Managers", path: "/director/manager-analytics" },
        { icon: <BsPersonBadge />, label: "Assistants", path: "/director/assistant-performance" },
      ],
    },
    {
      label: "Classrooms",
      items: [
        { icon: <FiUsers />, label: "Google Accounts", path: "/director/google-accounts" },
        { icon: <FiBookOpen />, label: "Course Management", path: "/director/courses" },
        { icon: <FiBarChart2 />, label: "Submission Viewer", path: "/director/submissions" },
        {
          icon: <FiUploadCloud />,
          label: "Mariam Gabalawy",
          path: "/director/mariamgabalawy",
          badge: partnerBadge("/director/mariamgabalawy"),
        },
        {
          icon: <FiUploadCloud />,
          label: "Dr Peter",
          path: "/director/drpeter",
          badge: partnerBadge("/director/drpeter"),
        },
        { icon: <FiEdit3 />, label: "Manual Correction", path: "/director/manual-correction" },
        { icon: <FiUser />, label: "Assign Assistants", path: "/director/assign-assistants" },
        { icon: <FiUploadCloud />, label: "Assign Grading Partners", path: "/director/grading-delegations" },
      ],
    },
    {
      label: "Insights",
      items: [
        { icon: <FiBarChart2 />, label: "Insights", path: "/director/insights" },
        { icon: <FiClipboard />, label: "Reports", path: "/director/reports" },
        { icon: <FiBarChart2 />, label: "Manager Workload", path: "/director/manager-workload" },
        { icon: <FiTarget />, label: "Accuracy Metrics", path: "/director/accuracy-metrics" },
        { icon: <FiBarChart2 />, label: "Token Usage", path: "/director/token-usage" },
        { icon: <FiMessageSquare />, label: "Report Feedback", path: "/director/feedback" },
        { icon: <FiSend />, label: "WhatsApp Scheduler", path: "/director/whatsapp-scheduler" },
        { icon: <FiRadio />, label: "WhatsApp Broadcast", path: "/director/whatsapp-broadcast" },
        { icon: <FiCpu />, label: "AI Agent", path: "/director/ai-agent" },
        { icon: <FiMessageCircle />, label: "Chatbot", path: "/director/chatbot" },
      ],
    },
  ];
}

function DirectorShell() {
  const { counts } = useGradingNotifications();
  const navSections = useMemo(() => buildNavSections(counts), [counts]);

  return (
    <RoleShell
      sidebar={
        <RoleSidebar
          roleLabel="Director"
          accountLabel="Admin account"
          navSections={navSections}
        />
      }
    >
      <div className="ast-page director-page">
        <div className="director-page-inner">
          <Outlet />
        </div>
      </div>
    </RoleShell>
  );
}

export default function DirectorLayout() {
  return (
    <GradingNotificationProvider>
      <DirectorShell />
    </GradingNotificationProvider>
  );
}
