import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import "./DirectorLayout.css";

import {
  FiMenu,
  FiHome,
  FiUsers,
  FiBook,
  FiShield,
  FiLogOut,
  FiLayers,
  FiBarChart2,

} from "react-icons/fi";

export default function DirectorLayout() {

  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed,setCollapsed] = useState(false);

  const user = JSON.parse(localStorage.getItem("user"));

  const menuItems = [
    {
      name:"Dashboard",
      icon:<FiHome/>,
      path:"/director/dashboard"
    },
    {
      name:"People",
      icon:<FiUsers/>,
      path:"/director/people"
    },
    {
      name:"Classroom Managers",
      icon:<FiLayers/>,
      path:"/director/classroommanagers"
    },
    {
      name:"Quality Managers",
      icon:<FiShield/>,
      path:"/director/quality-managers"
    },
    {
      name:"Subjects",
      icon:<FiBook/>,
      path:"/director/subjects"
    },
    {
      name: "Manager Workload",
      icon: <FiBarChart2 />,
      path: "/director/manager-workload"
    },
    {
      name: "Create Teachers",
      icon: <FiBarChart2 />,
      path: "/manage-teachers"
    },
    {
      name: "Assign Classroom Teacher",
      icon: <FiBarChart2 />,
      path: "/manage-classroom-teachers"
    }
  ];

  return(

    <div className="directorLayout">

      {/* SIDEBAR */}

      <div className={`directorSidebar ${collapsed ? "collapsed" : ""}`}>

        <div className="sidebarHeader">

          <button
            className="sidebarToggle"
            onClick={()=>setCollapsed(!collapsed)}
          >
            <FiMenu/>
          </button>

          {!collapsed && (
            <div className="sidebarBrand">
              <span className="brandTitle">Director</span>
            </div>
          )}

        </div>

        <div className="sidebarMenu">

          {menuItems.map((item)=>{

            const active = location.pathname === item.path;

            return(

              <div
                key={item.path}
                className={`sidebarItem ${active ? "active" : ""}`}
                onClick={()=>navigate(item.path)}
              >

                <div className="sidebarIcon">
                  {item.icon}
                </div>

                {!collapsed && (
                  <span className="sidebarText">
                    {item.name}
                  </span>
                )}

              </div>

            );

          })}

        </div>

      </div>


      {/* MAIN */}

      <div className="directorMain">

        <div className="directorTopbar">

          <div className="welcome">
            Welcome, <span>{user?.name}</span>
          </div>

          <button
            className="logoutBtn"
            onClick={()=>{
              localStorage.clear();
              navigate("/login");
            }}
          >

            <FiLogOut/>
            Logout

          </button>

        </div>

        <div className="directorContent">
          <Outlet/>
        </div>

      </div>

    </div>

  );

}