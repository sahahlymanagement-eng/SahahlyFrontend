import {
  FiHome, FiUsers, FiClipboard, FiFileText, FiBookOpen,
  FiZap, FiEye, FiLayers, FiBarChart2, FiUploadCloud, FiMessageSquare, FiSend, FiCpu, FiMessageCircle,
  FiRadio, FiUser
} from "react-icons/fi";
import RoleSidebar from "./RoleSidebar";
import {
  useGradingNotifications,
  useGradingDelegations,
} from "../context/GradingNotificationContext";
import {
  canGradeProvider,
  isGradingOnlyAccount,
  isDedicatedProviderManager,
} from "../utils/gradingAccess";

// External grading company tabs — each visible only to the accounts allowed to
// grade for that particular partner, and badged with its own unread count. Keyed
// by provider slug (see GRADING_PROVIDERS).
const GRADING_NAV_PATHS = {
  "/manager/logincss": "logincss",
  "/manager/mariamgabalawy": "mariamgabalawy",
  "/manager/drpeter": "drpeter",
};

// A provider-manager's own "assign assistants to a class" tab — shown only
// to the dedicated "Manager - <Provider>" role (see isDedicatedProviderManager),
// not to every account that canGradeProvider (e.g. manager01 has no
// whole-assignment delegation to hang this page off of).
const ASSIGN_ASSISTANTS_NAV_PATHS = {
  "/manager/mariamgabalawy-assign-assistants": "mariamgabalawy",
  "/manager/drpeter-assign-assistants": "drpeter",
};

const NAV_ITEMS = [
  { icon: <FiHome />,      label: "Dashboard",          path: "/manager/dashboard"      },
  { icon: <FiUser />,      label: "Assign Assistants",  path: "/manager/assign-assistants" },
  { icon: <FiUsers />,     label: "Students Data",      path: "/manager/students"       },
  { icon: <FiClipboard />, label: "Reports",            path: "/manager/assignments"    },
  { icon: <FiEye />,       label: "Submission Viewer",  path: "/manager/submissions"    },
  { icon: <FiLayers />,    label: "Automatic Batch Queue", path: "/manager/automatic-batch-queue" },
  { icon: <FiCpu />,       label: "Automation",         path: "/manager/automation"     },
  { icon: <FiBarChart2 />, label: "Token Usage",        path: "/manager/token-usage"    },
  { icon: <FiMessageSquare />, label: "Report Feedback", path: "/manager/feedback"   },
  { icon: <FiSend />,      label: "WhatsApp Scheduler", path: "/manager/whatsapp-scheduler" },
  { icon: <FiRadio />,     label: "WhatsApp Broadcast", path: "/manager/whatsapp-broadcast" },
  { icon: <FiCpu />,       label: "AI Agent",           path: "/manager/ai-agent"           },
  { icon: <FiMessageCircle />, label: "Chatbot",        path: "/manager/chatbot"            },
  { icon: <FiFileText />,  label: "Sahahly AI Marking",  path: "/manager/marking"        },
  { icon: <FiFileText />,  label: "Claude AI Marking",  path: "/manager/markingclaude"  },
  { icon: <FiUploadCloud />, label: "LoginCSS",         path: "/manager/logincss"       },
  { icon: <FiUploadCloud />, label: "Mariam Gabalawy",  path: "/manager/mariamgabalawy" },
  { icon: <FiUploadCloud />, label: "Dr Peter",         path: "/manager/drpeter"        },
  { icon: <FiUser />,      label: "Assign Assistants — Mariam Gabalawy", path: "/manager/mariamgabalawy-assign-assistants" },
  { icon: <FiUser />,      label: "Assign Assistants — Dr Peter",        path: "/manager/drpeter-assign-assistants" },
  { icon: <FiZap />,       label: "Question Bank",      path: "/questionbank/manage"    },
  { icon: <FiBookOpen />,  label: "Course Management",  path: "/manager/courses" },
];

export default function ManagerSidebar() {
  // The delegation grant is passed explicitly rather than left to
  // canGradeProvider's module cache, so this render is tied to it and a
  // director-delegated tab appears the moment the grant resolves.
  const { counts } = useGradingNotifications();
  const { delegations } = useGradingDelegations();

  // A dedicated per-provider Manager role (Manager - <Provider>) is confined
  // entirely to its one provider tab — no dashboard, students, reports, etc.
  // Every other manager keeps the full list, unaffected.
  const gradingOnly = isGradingOnlyAccount();

  const navItems = NAV_ITEMS.filter((item) => {
    const assignSlug = ASSIGN_ASSISTANTS_NAV_PATHS[item.path];
    if (assignSlug) return isDedicatedProviderManager(assignSlug);
    const slug = GRADING_NAV_PATHS[item.path];
    if (!slug) return !gradingOnly;
    return canGradeProvider(slug, delegations);
  }).map((item) => {
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
