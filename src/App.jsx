import { BrowserRouter, Routes, Route } from "react-router-dom";
import RoleProtectedRoute from "./components/RoleProtectedRoute";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";


import GoogleConnectTest from "./pages/GoogleConnectTest";
import AssignmentFetchTest from "./pages/AssignmentFetchTest";
import AssignmentIngestionTest from "./pages/AssignmentIngestionTest";
import AssignmentStudentsStatus from "./pages/AssignmentStudentsStatus";
import SubjectManagementTest from "./pages/SubjectManagementTest";
import RoleManagementTest from "./pages/RoleManagementTest";
import PeopleManagementTest from "./pages/PeopleManagementTest";
import ManagerClassroomTest from "./pages/ManagersClassroomTest";
import ManagerAssignmentIngestTest from "./pages/ManagerAssignmentIngestTest";
import ManagerAssignmentDelegationTest from "./pages/ManagerAssignmentDelegationTest";
import QualityManagerClassroomAssignmentTest from "./pages/QualityManagerClassroomAssignmentTest";
import AssistantAssignmentsTest from "./pages/AssistantAssignmentsTest";
import QualityManagerAssignmentDelegationTest from "./pages/QualityManagerAssignmentDelegationTest";
import QualityTeamAssignmentsTest from "./pages/QualityTeamAssignmentsTest";
import QualityChecklistItemsTest from "./pages/QualityChecklistItemsTest";
import QualityChecklistItems from "./pages/QualityChecklistItemsPage";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import SetupPassword from "./pages/SetupPassword";
import AssistantDashboard from "./pages/assistant/Dashboard";
import ResetPassword from "./pages/ResetPassword";
import AssistantAssignments from "./pages/assistant/AssistantAssignments";
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import ManagerDelegations from "./pages/manager/ManagerDelegations";
// import TeacherManager from "./pages/director/TeacherManager";
import TeacherManager from "./pages/director/TeacherCreation";
import ClassroomTeacherManager from "./pages/ClassroomTeacherManager";
import QualityTeamDashboard from "./pages/quality team/QualityTeamDashboard";
import QualityManagerDashboard from "./pages/quality manager/QualityManagerDashboard";
import DirectorDashboard from "./pages/director/DirectorDashboard";
import DirectorPeople from "./pages/director/DirectorPeople";
import DirectorLayout from "./pages/director/DirectorLayout";
import DirectorSubjects from "./pages/director/DirectorSubjects";
import DirectorClassroomManagers from "./pages/director/DirectorClassroomManagers";
import DirectorQualityManagers from "./pages/director/DirectorQualityManagers";
import DirectorManagerWorkload from "./pages/director/DirectorManagerWorkload";
import DirectorTokenUsage from "./pages/director/DirectorTokenUsage";
import OperationMetrics from "./pages/manager/operation-metrics";
import ManagerTokenUsage from "./pages/manager/ManagerTokenUsage";
import ManagerAssignments from "./pages/manager/ManagerAssignments";
import ManagerStudents from "./pages/manager/ManagerStudents";
import DirectorGoogleAccount from "./pages/director/DirectorGoogleAccount";
import ManagerSubmissionViewer from "./pages/manager/ManagerSubmissionViewer";
import PaperMarking from "./pages/manager/PaperMarking";
import PaperMarkingClaude from "./pages/manager/PaperMarkingClaude";
import QBManage from "./pages/questionbank/QBManage";
import QBUpload from "./pages/questionbank/QBUpload";
import QBBrowse from "./pages/questionbank/QBBrowse";
import QBClassify from "./pages/questionbank/QBClassify";
import ExamPositionMapper from "./pages/admin/ExamPositionMapper";

// import GoogleClassroom from "./pages/manager/CourseManagment/Courses";
// import CoursesList from "./pages/manager/CourseManagment/CourseList";
// import CourseWork from "./pages/manager/CourseManagment/CourseWork";
// import SubmissionActions from "./pages/manager/CourseManagment/SubmissionActions";
import GoogleClassroom from "./components/CourseManagment/Courses"
import CoursesList from "./components/CourseManagment/CourseList";
import CourseWork from "./components/CourseManagment/CourseWork";
import SubmissionActions from "./components/CourseManagment/SubmissionActions";
import AssistantSubmissionViewer from "./pages/assistant/AssistantSubmissionViewer";
import AssistantStudents from "./pages/assistant/AssistantStudents";
import AssistantReports from "./pages/assistant/AssistantReports";

import TeacherDashboard from "./pages/teacher/TeacherDashboard"


function App() {
  return (
    <BrowserRouter>
      <ToastContainer
          position="top-right"
          autoClose={3500}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          draggable
        />
      <Routes>
        
        <Route path="/" element={<Login />} />
        <Route path="/googleConnectTest" element={<GoogleConnectTest />} />

        <Route path="/assignment-test" element={<AssignmentFetchTest />} />

        {/* The general page where we ingest assignments for any classroom of any google account */}
        <Route path="/assignment-ingest" element={<AssignmentIngestionTest />}/>
        
        <Route path="/assignments/:assignmentId/students"element={<AssignmentStudentsStatus />}/>
        <Route path="/test-subjects" element={<SubjectManagementTest />} />
        <Route path="/test-roles" element={<RoleManagementTest />} />
        <Route path="/test-people" element={<PeopleManagementTest />} />



        {/* <Route path="/google-classroom" element={<GoogleClassroom />} /> */}
        
        


        {/* Assigning Managers to Classrooms */}
        <Route path="/test-manager-classrooms" element={<ManagerClassroomTest />} />

        <Route path="/test-manager-assignment-ingest" element={<ManagerAssignmentIngestTest />}/>
        <Route path="/test-assignment-delegation" element={<ManagerAssignmentDelegationTest />}/>


        <Route path="/test-quality-manager-classroom-assignments" element={<QualityManagerClassroomAssignmentTest />}/>
        <Route path="/test-assistant-assignments" element={<AssistantAssignmentsTest />}/>
        <Route path="/test-quality-manager-assignment-delegation" element={<QualityManagerAssignmentDelegationTest />}/>

        
        {/* The page of the quality team itself, where the quality team does his job */}
        <Route path="/test-quality-team-assignments" element={<QualityTeamAssignmentsTest />}/>


        {/* The page of creating the quality checklist items */}
        <Route path="/test-quality-checklist-items" element={<QualityChecklistItemsTest />}/>
        
        {/* The main Login page */}
        <Route path="/login" element={<Login />} />

        {/* Forgot Password Page */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        
        {/* Reset Password Page */}
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* The page for first-time users to set their password */}
        <Route path="/setup-password" element={<SetupPassword />} />
        <Route path="/quality-checklist-items" element={<QualityChecklistItems />} />


        <Route path="/questionbank/manage" element={<QBManage />} />
        <Route path="/questionbank/upload" element={<QBUpload />} />
        <Route path="/questionbank/browse" element={<QBBrowse />} />
        <Route path="/questionbank/classify" element={<QBClassify />} />

        {/* Exam Position Mapper — admin-only tool */}
        {/* <Route path="/admin/exam-position-mapper" element={<ExamPositionMapper />} /> */}

        <Route path="/teacher/dashboard" element={
          <RoleProtectedRoute allowedRole="teacher">
            <TeacherDashboard />
          </RoleProtectedRoute>}
        />
        
        <Route path="/teacher/courses" element={
          <RoleProtectedRoute allowedRole={["teacher"]}>
            <CoursesList />
          </RoleProtectedRoute>}
        />
        <Route path="/teacher/coursework/:courseId" element={
          <RoleProtectedRoute allowedRole={["teacher"]}>
            <CourseWork />
          </RoleProtectedRoute>}
        />


        {/* Assistant dashboard route */}
        <Route path="/assistant/dashboard" element={
          <RoleProtectedRoute allowedRole="assistant">
            <AssistantDashboard />
          </RoleProtectedRoute>}
        />

        {/* Assistant Assignments route */}
        <Route path="/assistant/assignments" element={
          <RoleProtectedRoute allowedRole="assistant">
            <AssistantAssignments />
          </RoleProtectedRoute>}
        />

        <Route path="/assistant/assignments/:assignmentId" element={
          <RoleProtectedRoute allowedRole="assistant">
            <AssistantSubmissionViewer />
          </RoleProtectedRoute>
        }/>

       <Route path="/assistant/assignments/:assignmentId/students" element={
          <RoleProtectedRoute allowedRole="assistant">
            <AssistantStudents />
          </RoleProtectedRoute>
        }/>
        
        <Route path="/assistant/assignments/:assignmentId/students/reports" element={
          <RoleProtectedRoute allowedRole="assistant">
            <AssistantReports />
          </RoleProtectedRoute>
        }/>


        {/* Manager dashboard route */}
        <Route path="/manager/dashboard" element={
          <RoleProtectedRoute allowedRole="manager">
            <ManagerDashboard />
          </RoleProtectedRoute>}
        />

        {/* Manager Delegations route */}
        <Route path="/manager/delegations" element={
          <RoleProtectedRoute allowedRole="manager">
            <ManagerDelegations />
          </RoleProtectedRoute>}
        />


        <Route path="/manager/operation-metrics" element={
          <RoleProtectedRoute allowedRole="manager">
            <OperationMetrics defaultTab="metrics" />
          </RoleProtectedRoute>}
        />

        <Route path="/manager/token-usage" element={
          <RoleProtectedRoute allowedRole="manager">
            <ManagerTokenUsage />
          </RoleProtectedRoute>}
        />

        <Route path="/manager/assignments" element={
          <RoleProtectedRoute allowedRole="manager">
            <ManagerAssignments />
          </RoleProtectedRoute>}
        />

        <Route path="/manager/students" element={
          <RoleProtectedRoute allowedRole="manager">
            <ManagerStudents />
          </RoleProtectedRoute>}
        />

        <Route path="/manager/submissions" element={
          <RoleProtectedRoute allowedRole="manager">
            <ManagerSubmissionViewer />
          </RoleProtectedRoute>}
        />

        <Route path="/manager/marking" element={
          <RoleProtectedRoute allowedRole="manager">
            <PaperMarking />
          </RoleProtectedRoute>}
        />

        <Route path="/manager/markingclaude" element={
          <RoleProtectedRoute allowedRole="manager">
            <PaperMarkingClaude />
          </RoleProtectedRoute>}
        />

        <Route path="/manager/google-classroom" element={
          <RoleProtectedRoute allowedRole={["manager"]}>
            <GoogleClassroom />
          </RoleProtectedRoute>}
        />

        <Route path="/manager/courses" element={
          <RoleProtectedRoute allowedRole={["manager"]}>
            <CoursesList />
          </RoleProtectedRoute>}
        />

        
        
        <Route path="/manager/coursework/:courseId" element={
          <RoleProtectedRoute allowedRole={["manager", "teacher"]}>
            <CourseWork />
          </RoleProtectedRoute>}
        />

        <Route
          path="/manager/submission/:courseId/:courseWorkId/:submissionId" element={
          <RoleProtectedRoute allowedRole="manager">
            <SubmissionActions />
          </RoleProtectedRoute>}
        />


        {/* Quality Team dashboard route */}
        <Route path="/quality-team/dashboard" element={
          <RoleProtectedRoute allowedRole="quality team">
            <QualityTeamDashboard />
          </RoleProtectedRoute>}
        />

        {/* Quality Manager dashboard route */}
        <Route path="/quality-manager/dashboard" element={
          <RoleProtectedRoute allowedRole="quality manager">
            <QualityManagerDashboard />
          </RoleProtectedRoute>}
        />

        {/* Director dashboard route */}
        <Route
          path="/director"
          element={
            <RoleProtectedRoute allowedRole="admin">
              <DirectorLayout/>
            </RoleProtectedRoute>
          }
         >

          <Route path="dashboard" element={<DirectorDashboard/>}/>
          <Route path="people" element={<DirectorPeople/>}/>
          <Route path="ClassroomManagers" element={<DirectorClassroomManagers/>}/>
          <Route path="quality-managers" element={<DirectorQualityManagers/>}/> 
          <Route path="subjects" element={<DirectorSubjects/>}/>
          <Route path="manager-workload" element={<DirectorManagerWorkload/>}/>
          <Route path="token-usage" element={<DirectorTokenUsage />} />
          <Route path="manage-teachers" element={<TeacherManager />} />
          <Route path="manage-classroom-teachers" element={<ClassroomTeacherManager />} />
          <Route path="google-accounts" element={<DirectorGoogleAccount />} />
          
          <Route path="/director/google-classroom" element={<GoogleClassroom />}/>

          <Route path="/director/courses" element={<CoursesList />}/>


          <Route path="/director/coursework/:courseId" element={ <CourseWork />}/>

        </Route>







    
      </Routes>
    </BrowserRouter>
  );
}

export default App;
