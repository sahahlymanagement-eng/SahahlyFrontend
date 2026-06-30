import {
  FiGrid, FiUpload, FiSearch, FiZap, FiHome,
} from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";
import RoleShell from "../../components/RoleShell";
import "./QuestionBank.css";

const NAV_ITEMS = [
  { icon: <FiGrid />, label: "Manage", path: "/questionbank/manage" },
  { icon: <FiUpload />, label: "Upload", path: "/questionbank/upload" },
  { icon: <FiSearch />, label: "Browse", path: "/questionbank/browse" },
  { icon: <FiZap />, label: "Classify", path: "/questionbank/classify" },
  { icon: <FiHome />, label: "Manager Dashboard", path: "/manager/dashboard" },
];

export default function QBLayout({ children, title, subtitle }) {
  return (
    <RoleShell
      sidebar={
        <RoleSidebar
          roleLabel="Question Bank"
          accountLabel="Manager tools"
          navItems={NAV_ITEMS}
        />
      }
    >
      <div className="qb-main qb-main--embedded">
        <header className="qb-topbar">
          <div>
            <h1 className="qb-topbar-title">{title}</h1>
            {subtitle && <p className="qb-topbar-sub">{subtitle}</p>}
          </div>
        </header>
        <div className="qb-content">
          {children}
        </div>
      </div>
    </RoleShell>
  );
}
