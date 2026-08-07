import { Outlet } from "react-router-dom";

import {

  FiHome,

  FiUsers,

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

  FiMessageCircle,

} from "react-icons/fi";

import { BsPersonBadge } from "react-icons/bs";

import RoleSidebar from "../../components/RoleSidebar";

import RoleShell from "../../components/RoleShell";

import "./directorShell.css";



const NAV_SECTIONS = [

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

      { icon: <FiCpu />, label: "AI Agent", path: "/director/ai-agent" },

      { icon: <FiMessageCircle />, label: "Chatbot", path: "/director/chatbot" },

    ],

  },

];



export default function DirectorLayout() {

  return (

    <RoleShell

      sidebar={

        <RoleSidebar

          roleLabel="Director"

          accountLabel="Admin account"

          navSections={NAV_SECTIONS}

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

