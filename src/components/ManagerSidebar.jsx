import {
  FiHome, FiUsers, FiClipboard, FiFileText, FiBookOpen,
  FiZap, FiEye, FiBarChart2, FiUploadCloud, FiMessageSquare, FiSend
} from "react-icons/fi";
import RoleSidebar from "./RoleSidebar";
import { useGradingNotifications } from "../context/GradingNotificationContext";
import { isGradingManager } from "../utils/gradingAccess";

// External grading company tabs — visible only to grading managers, each badged
// with its own unread count. Keyed by provider slug (see GRADING_PROVIDERS).
const GRADING_NAV_PATHS = {
  "/manager/logincss": "logincss",
  "/manager/mariamgabalawy": "mariamgabalawy",
};

const NAV_ITEMS = [
  { icon: <FiHome />,      label: "Dashboard",          path: "/manager/dashboard"      },
  { icon: <FiUsers />,     label: "Students Data",      path: "/manager/students"       },
  { icon: <FiClipboard />, label: "Reports",            path: "/manager/assignments"    },
  { icon: <FiEye />,       label: "Submission Viewer",  path: "/manager/submissions"    },
  { icon: <FiBarChart2 />, label: "Token Usage",        path: "/manager/token-usage"    },
  { icon: <FiMessageSquare />, label: "Report Feedback", path: "/manager/feedback"   },
  { icon: <FiSend />,      label: "WhatsApp Scheduler", path: "/manager/whatsapp-scheduler" },
  { icon: <FiFileText />,  label: "Gemini AI Marking",  path: "/manager/marking"        },
  { icon: <FiFileText />,  label: "Claude AI Marking",  path: "/manager/markingclaude"  },
  { icon: <FiUploadCloud />, label: "LoginCSS",         path: "/manager/logincss"       },
  { icon: <FiUploadCloud />, label: "Mariam Gabalawy",  path: "/manager/mariamgabalawy" },
  { icon: <FiZap />,       label: "Question Bank",      path: "/questionbank/manage"    },
  { icon: <FiBookOpen />,  label: "Course Management",  path: "/manager/courses" },
];

export default function ManagerSidebar() {
  const { counts } = useGradingNotifications();
  const showGrading = isGradingManager();

  const navItems = (showGrading
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => !GRADING_NAV_PATHS[item.path])
  ).map((item) => {
    const slug = GRADING_NAV_PATHS[item.path];
    const unread = slug ? counts[slug]?.ungradedTotal ?? 0 : 0;
    return unread > 0 ? { ...item, badge: unread } : item;
  });

  return (
    <RoleSidebar
      roleLabel="Manager"
      accountLabel="Manager account"
      navItems={navItems}
    />
  );
}
