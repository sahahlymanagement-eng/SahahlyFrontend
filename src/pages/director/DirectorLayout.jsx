import { Outlet } from "react-router-dom";

import {

  FiHome,

  FiUsers,

  FiBook,

  FiShield,

  FiLayers,

  FiBarChart2,

  FiBookOpen,

  FiUserPlus,

  FiLink,

  FiMessageSquare,

} from "react-icons/fi";

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

      { icon: <FiShield />, label: "Quality Managers", path: "/director/quality-managers" },

      { icon: <FiUserPlus />, label: "Create Teachers", path: "/director/manage-teachers" },

      { icon: <FiLink />, label: "Assign Classroom Teacher", path: "/director/manage-classroom-teachers" },

    ],

  },

  {

    label: "Classrooms",

    items: [

      { icon: <FiBook />, label: "Subjects", path: "/director/subjects" },

      { icon: <FiUsers />, label: "Google Accounts", path: "/director/google-accounts" },

      { icon: <FiBookOpen />, label: "Course Management", path: "/director/courses" },

      { icon: <FiBarChart2 />, label: "Submission Viewer", path: "/director/submissions" },

    ],

  },

  {

    label: "Insights",

    items: [

      { icon: <FiBarChart2 />, label: "Manager Workload", path: "/director/manager-workload" },

      { icon: <FiUsers />, label: "Assistant Performance", path: "/director/assistant-performance" },

      { icon: <FiBarChart2 />, label: "Token Usage", path: "/director/token-usage" },

      { icon: <FiMessageSquare />, label: "Report Feedback", path: "/director/feedback" },

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

