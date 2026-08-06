import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import RoleProtectedRoute from "./components/RoleProtectedRoute";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import "./styles/theme.css";
import "./styles/ui-polish.css";


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
import ManagerLoginCss from "./pages/manager/ManagerLoginCss";
import ManagerMariamGabalawy from "./pages/manager/ManagerMariamGabalawy";
import ManagerDrPeter from "./pages/manager/ManagerDrPeter";
import Login from "./pages/Login";
import PrivacySecurityPolicy from "./pages/PrivacySecurityPolicy";
import ZoomDocumentation from "./pages/ZoomDocumentation";
import Support from "./pages/Support";
import TermsOfUse from "./pages/TermsOfUse";
import ForgotPassword from "./pages/ForgotPassword";
import SetupPassword from "./pages/SetupPassword";
import AssistantDashboard from "./pages/assistant/Dashboard";
import ResetPassword from "./pages/ResetPassword";
import AssistantAssignments from "./pages/assistant/AssistantAssignments";
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import ManagerDelegations from "./pages/manager/ManagerDelegations";
// import TeacherManager from "./pages/director/TeacherManager";
import TeacherManager from "./pages/director/TeacherCreation";
import QualityTeamDashboard from "./pages/quality team/QualityTeamDashboard";
import QualityManagerDashboard from "./pages/quality manager/QualityManagerDashboard";
import DirectorDashboard from "./pages/director/DirectorDashboard";
import DirectorPeople from "./pages/director/DirectorPeople";
import DirectorLayout from "./pages/director/DirectorLayout";
import DirectorSubjects from "./pages/director/DirectorSubjects";
import DirectorClassroomManagers from "./pages/director/DirectorClassroomManagers";
import DirectorGradingDelegations from "./pages/director/DirectorGradingDelegations";
import DirectorManagerWorkload from "./pages/director/DirectorManagerWorkload";
import DirectorTokenUsage from "./pages/director/DirectorTokenUsage";
import DirectorAssistantPerformance from "./pages/director/DirectorAssistantPerformance";
import DirectorAccuracyMetrics from "./pages/director/DirectorAccuracyMetrics";
import DirectorFeedback from "./pages/director/DirectorFeedback";
import DirectorReports from "./pages/director/DirectorReports";
import DirectorAssignments from "./pages/director/DirectorAssignments";
import BackupLayout from "./pages/backup/BackupLayout";
import BackupAssignments from "./pages/backup/BackupAssignments";
import OperationMetrics from "./pages/manager/operation-metrics";
import ManagerTokenUsage from "./pages/manager/ManagerTokenUsage";
import ManagerFeedback from "./pages/manager/ManagerFeedback";
import ManagerAssignments from "./pages/manager/ManagerAssignments";
import ManagerStudents from "./pages/manager/ManagerStudents";
import DirectorGoogleAccount from "./pages/director/DirectorGoogleAccount";
import DirectorChatbot from "./pages/director/DirectorChatbot";
import DirectorActionsChatbot from "./pages/director/DirectorActionsChatbot";
import ManagerSubmissionViewer from "./pages/manager/ManagerSubmissionViewer";
import ManagerWhatsAppScheduler from "./pages/manager/ManagerWhatsAppScheduler";
import ManagerAutomation from "./pages/manager/ManagerAutomation";
import ManagerChatbot from "./pages/manager/ManagerChatbot";
import ManagerActionsChatbot from "./pages/manager/ManagerActionsChatbot";
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
import AssistantPerformance from "./pages/assistant/AssistantPerformance";
import AssistantChatbot from "./pages/assistant/AssistantChatbot";
import AssistantLayout from "./pages/assistant/AssistantLayout";
import ManagerLayout from "./pages/manager/ManagerLayout";
import QualityManagerLayout from "./pages/quality manager/QualityManagerLayout";
import QualityTeamLayout from "./pages/quality team/QualityTeamLayout";

import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import TeacherLayout from "./pages/teacher/TeacherLayout";
import TeacherCourses from "./pages/teacher/TeacherCourses";
import TeacherReports from "./pages/teacher/TeacherReports";
import TeacherChatbot from "./pages/teacher/TeacherChatbot";
import TeacherActionsChatbot from "./pages/teacher/TeacherActionsChatbot";
import ViewCoursework from "./components/CourseManagment/ViewCourseWork";

function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <ToastContainer
      position="bottom-right"
      autoClose={3500}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      pauseOnHover
      draggable
      theme={theme}
    />
  );
}

function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <ThemedToaster />
      <Routes>
        
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/privacy-security" element={<PrivacySecurityPolicy />} />
        <Route path="/privacy" element={<Navigate to="/privacy-security" replace />} />
        <Route path="/zoom-documentation" element={<ZoomDocumentation />} />
        <Route path="/support" element={<Support />} />
        <Route path="/terms-of-use" element={<TermsOfUse />} />
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

        <Route path="/teacher" element={
          <RoleProtectedRoute allowedRole="teacher">
            <TeacherLayout />
          </RoleProtectedRoute>
        }>
          <Route path="dashboard" element={<TeacherDashboard />} />
          <Route path="courses" element={<TeacherCourses />} />
          <Route path="submissions" element={<ManagerSubmissionViewer scope="teacher" />} />
          <Route path="reports" element={<TeacherReports />} />
          <Route path="ai-agent" element={<TeacherChatbot />} />
          <Route path="chatbot" element={<TeacherActionsChatbot />} />
          <Route path="coursework/:courseId" element={<CourseWork />} />
          <Route path="coursework/:courseId/edit/:courseWorkId" element={<CourseWork />} />
          <Route path="view-coursework/:courseId" element={<ViewCoursework />} />
        </Route>

        {/* Assistant routes */}
        <Route
          path="/assistant"
          element={
            <RoleProtectedRoute allowedRole="assistant">
              <AssistantLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AssistantDashboard />} />
          <Route path="performance" element={<AssistantPerformance />} />
          <Route path="assignments" element={<AssistantAssignments />} />
          <Route path="automation" element={<ManagerAutomation scope="assistant" />} />
          <Route path="assignments/:assignmentId" element={<AssistantSubmissionViewer />} />
          <Route path="assignments/:assignmentId/students" element={<AssistantStudents />} />
          <Route
            path="assignments/:assignmentId/students/reports"
            element={<Navigate to="/assistant/reports" replace />}
          />
          <Route path="reports" element={<AssistantReports />} />
          <Route path="chatbot" element={<AssistantChatbot />} />
          {/* External grading company tabs — the same pages the manager portal
              serves, gated per-account by canGradeProvider() inside each page.
              LoginCSS is here too now: it used to be manager01's alone, but the
              director can delegate a LoginCSS assignment to an assistant, and
              the tab has to exist for them to land on. */}
          <Route path="logincss" element={<ManagerLoginCss />} />
          <Route path="mariamgabalawy" element={<ManagerMariamGabalawy />} />
          <Route path="drpeter" element={<ManagerDrPeter />} />
        </Route>


        {/* Manager routes */}
        <Route
          path="/manager"
          element={
            <RoleProtectedRoute allowedRole="manager">
              <ManagerLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ManagerDashboard />} />
          <Route path="delegations" element={<ManagerDelegations />} />
          <Route path="operation-metrics" element={<OperationMetrics defaultTab="metrics" />} />
          <Route path="token-usage" element={<ManagerTokenUsage />} />
          <Route path="feedback" element={<ManagerFeedback />} />
          <Route path="assignments" element={<ManagerAssignments />} />
          <Route path="students" element={<ManagerStudents />} />
          <Route path="submissions" element={<ManagerSubmissionViewer scope="manager" />} />
          <Route path="automation" element={<ManagerAutomation scope="manager" />} />
          <Route path="whatsapp-scheduler" element={<ManagerWhatsAppScheduler />} />
          <Route path="marking" element={<PaperMarking />} />
          <Route path="logincss" element={<ManagerLoginCss />} />
          <Route path="mariamgabalawy" element={<ManagerMariamGabalawy />} />
          <Route path="drpeter" element={<ManagerDrPeter />} />
          <Route path="markingclaude" element={<PaperMarkingClaude />} />
          <Route path="google-classroom" element={<GoogleClassroom />} />
          <Route path="courses" element={<CoursesList />} />
          <Route path="ai-agent" element={<ManagerChatbot />} />
          <Route path="chatbot" element={<ManagerActionsChatbot />} />
          <Route path="coursework/:courseId" element={<CourseWork />} />
          <Route path="coursework/:courseId/edit/:courseWorkId" element={<CourseWork />} />
          <Route path="submission/:courseId/:courseWorkId/:submissionId" element={<SubmissionActions />} />
          <Route path="view-coursework/:courseId" element={<ViewCoursework />} />
        </Route>

        {/* Quality Team */}
        <Route
          path="/quality-team"
          element={
            <RoleProtectedRoute allowedRole="quality team">
              <QualityTeamLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<QualityTeamDashboard />} />
        </Route>

        {/* Quality Manager */}
        <Route
          path="/quality-manager"
          element={
            <RoleProtectedRoute allowedRole="quality manager">
              <QualityManagerLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<QualityManagerDashboard />} />
        </Route>

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
          <Route path="classroommanagers" element={<DirectorClassroomManagers/>}/>
          <Route path="subjects" element={<DirectorSubjects/>}/>
          <Route path="manager-workload" element={<DirectorManagerWorkload/>}/>
          <Route path="assistant-performance" element={<DirectorAssistantPerformance />} />
          <Route path="accuracy-metrics" element={<DirectorAccuracyMetrics />} />
          <Route path="token-usage" element={<DirectorTokenUsage />} />
          <Route path="feedback" element={<DirectorFeedback />} />
          <Route path="insights" element={<DirectorReports />} />
          <Route path="reports" element={<DirectorAssignments />} />
          <Route
            path="org-reports"
            element={<Navigate to="/director/insights" replace />}
          />
          <Route path="manage-teachers" element={<TeacherManager />} />
          <Route path="google-accounts" element={<DirectorGoogleAccount />} />
          <Route path="google-classroom" element={<GoogleClassroom />} />
          <Route path="courses" element={<CoursesList />} />
          <Route path="submissions" element={<ManagerSubmissionViewer scope="director" />} />
          <Route path="assign-assistants" element={<ManagerDashboard scope="director" />} />
          <Route path="ai-agent" element={<DirectorChatbot />} />
          <Route path="chatbot" element={<DirectorActionsChatbot />} />
          <Route path="grading-delegations" element={<DirectorGradingDelegations />} />
          <Route path="coursework/:courseId" element={<CourseWork />} />
          <Route path="coursework/:courseId/edit/:courseWorkId" element={<CourseWork />} />
          <Route path="view-coursework/:courseId" element={<ViewCoursework />} />
        </Route>

        {/* Backup — limited director access */}
        <Route
          path="/backup"
          element={
            <RoleProtectedRoute allowedRole="backup">
              <BackupLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="submissions" replace />} />
          <Route path="submissions" element={<ManagerSubmissionViewer scope="backup" />} />
          <Route path="reports" element={<BackupAssignments />} />
          <Route path="courses" element={<CoursesList />} />
          <Route path="google-classroom" element={<GoogleClassroom />} />
          <Route path="coursework/:courseId" element={<CourseWork />} />
          <Route path="coursework/:courseId/edit/:courseWorkId" element={<CourseWork />} />
          <Route path="view-coursework/:courseId" element={<ViewCoursework />} />
        </Route>






    
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
