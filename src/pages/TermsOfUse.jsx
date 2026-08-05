import { Link } from "react-router-dom";
import { FiSun, FiMoon, FiArrowLeft, FiFileText } from "react-icons/fi";
import logo from "../assets/images/Logo-trimmed-hd.png";
import { useTheme } from "../context/ThemeContext";
import "./PrivacySecurityPolicy.css";

const INTRO = [
  `These Terms of Use govern access to and use of the Sahahly website, platform, dashboards, applications, tools, communications, and related operational and educational services.`,
  `Please read these Terms carefully before using Sahahly.`,
  `By creating an account, purchasing a service, accepting a proposal, accessing the Platform, or continuing to use Sahahly, you agree to these Terms. When you use Sahahly on behalf of a teacher, education centre, company, or other organisation, you confirm that you have authority to accept these Terms on its behalf.`,
];

const SECTIONS = [
  {
    title: "1. About Sahahly",
    blocks: [
      { type: "p", text: `Sahahly provides technology and managed operational services for teachers and education centres. Depending on the selected package, Sahahly may provide features and services including:` },
      { type: "ul", items: [
        `Session and class management`,
        `Automated attendance tracking`,
        `Session-recording management`,
        `Assignment and examination management`,
        `AI-assisted grading`,
        `Internal quality-control workflows`,
        `AI-assisted examination generation`,
        `Question-bank management`,
        `Student-performance analytics`,
        `Identification of students needing attention`,
        `Student follow-up`,
        `Academic and parent reports`,
        `WhatsApp notifications and reports`,
        `Assistant and operational workflow management`,
      ] },
      { type: "p", text: `Some features may only be available under specific subscriptions, service packages, locations, or integrations.` },
    ],
  },
  {
    title: "2. Definitions",
    blocks: [
      { type: "p", text: `For these Terms:` },
      { type: "ul", items: [
        `"Sahahly," "we," "us," or "our" means Sahahly Educational Technology.`,
        `"Platform" means Sahahly's website, web application, dashboards, applications, tools, systems, and related services.`,
        `"Customer" means the teacher, education centre, business, or person purchasing or subscribing to Sahahly.`,
        `"Authorized User" means any teacher, administrator, assistant, student, parent, guardian, employee, or contractor authorized to use the Platform under a Customer's account.`,
        `"Customer Data" means information, materials, documents, recordings, student details, assignments, answers, grades, reports, mark schemes, contact information, and other content submitted to or processed through Sahahly.`,
        `"User Content" means any content uploaded, entered, generated, communicated, or otherwise made available by a Customer or Authorized User.`,
        `"Order" means any signed proposal, subscription, service agreement, order form, quotation, or other written document describing the services purchased by a Customer.`,
      ] },
      { type: "p", text: `Where an Order conflicts with these Terms, the Order will control concerning the specific commercial services covered by that Order. A Data Processing Agreement will control concerning personal-data processing.` },
    ],
  },
  {
    title: "3. Eligibility and Authority",
    blocks: [
      { type: "p", text: `You may create a Customer account only when you:` },
      { type: "ul", items: [
        `Are at least 18 years old;`,
        `Have the legal capacity to enter into an agreement; and`,
        `Have authority to act for the teacher, centre, or organisation represented by the account.`,
      ] },
      { type: "p", text: `Students under 18 may only use Sahahly through a teacher, education centre, parent, or legal guardian who has lawfully authorized their access.` },
      { type: "p", text: `Customers must not create accounts for students, parents, assistants, or other individuals without the required authority, notices, and consents.` },
    ],
  },
  {
    title: "4. Accounts and Security",
    blocks: [
      { type: "p", text: `Customers and Authorized Users must provide complete, accurate, and current account information.` },
      { type: "p", text: `Each user should have an individual account. Login credentials must not be shared unless Sahahly expressly permits shared access for a particular account type.` },
      { type: "p", text: `You are responsible for:` },
      { type: "ul", items: [
        `Maintaining the confidentiality of your login credentials;`,
        `All activity occurring through your account;`,
        `Assigning appropriate user permissions;`,
        `Removing access when an assistant, employee, or user is no longer authorized;`,
        `Using secure devices and internet connections; and`,
        `Informing Sahahly promptly of suspected unauthorized access or security incidents.`,
      ] },
      { type: "p", text: `Sahahly may require password changes, multi-factor authentication, identity verification, or other security measures.` },
    ],
  },
  {
    title: "5. Use of the Services",
    blocks: [
      { type: "p", text: `Customers may use Sahahly only for legitimate educational and operational purposes and in accordance with:` },
      { type: "ul", items: [
        `These Terms;`,
        `The applicable Order;`,
        `Sahahly's published policies;`,
        `Applicable examination-board requirements;`,
        `Intellectual-property rights; and`,
        `Applicable laws and regulations.`,
      ] },
      { type: "p", text: `The Customer remains responsible for determining how Sahahly is used within its teaching operations and for supervising Authorized Users.` },
    ],
  },
  {
    title: "6. Customer and Teacher Responsibilities",
    blocks: [
      { type: "p", text: `The Customer is responsible for:` },
      { type: "ul", items: [
        `Providing complete, accurate, readable, and timely materials;`,
        `Providing the correct mark schemes, grading rules, schedules, and instructions;`,
        `Reviewing student and parent contact details;`,
        `Ensuring that uploaded materials may lawfully be used;`,
        `Obtaining required permissions for student data and recordings;`,
        `Reviewing grades, reports, alerts, and AI-generated outputs before relying on them;`,
        `Making final academic and disciplinary decisions;`,
        `Communicating relevant policies to students, parents, and assistants; and`,
        `Correcting inaccurate information when identified.`,
      ] },
      { type: "p", text: `Sahahly supports the Customer's operations but does not replace the teacher's academic judgment or responsibility toward students and parents.` },
    ],
  },
  {
    title: "7. Attendance Tracking",
    blocks: [
      { type: "p", text: `Sahahly may collect, calculate, import, or display attendance information using session data, integrations, manual entries, or other authorized sources.` },
      { type: "p", text: `Automated attendance may occasionally be incomplete or inaccurate because of:` },
      { type: "ul", items: [
        `Internet or connection failures;`,
        `Students joining with incorrect names or accounts;`,
        `Platform-integration errors;`,
        `Students joining through shared devices;`,
        `Late entry or early departure;`,
        `Incorrect schedules; or`,
        `Incomplete information supplied by the Customer.`,
      ] },
      { type: "p", text: `Teachers and Authorized Users must review attendance records before using them for disciplinary, academic, payment, or other significant decisions.` },
    ],
  },
  {
    title: "8. Assignments, Examinations and Reports",
    blocks: [
      { type: "p", text: `Sahahly may manage submissions, correction, quality control, grading, feedback, and reporting according to the Customer's selected service.` },
      { type: "p", text: `Any correction, grading, or reporting deadline applies only when:` },
      { type: "ul", items: [
        `The deadline is stated in an Order or agreed workflow;`,
        `Complete and readable materials have been received;`,
        `The correct mark scheme and instructions have been provided;`,
        `Student submissions have been received within the agreed period; and`,
        `The Customer has not requested changes to the scope after work begins.`,
      ] },
      { type: "p", text: `The delivery period begins when all required materials are received and confirmed as complete.` },
      { type: "p", text: `Deadlines may be reasonably extended when delays result from incomplete materials, changed instructions, late submissions, technical failures outside Sahahly's reasonable control, third-party outages, or force-majeure events.` },
    ],
  },
  {
    title: "9. AI and Automated Features",
    blocks: [
      { type: "p", text: `Sahahly may provide artificial-intelligence and automated features, including:` },
      { type: "ul", items: [
        `AI-assisted grading;`,
        `Examination and question generation;`,
        `Suggested feedback;`,
        `Student-performance summaries;`,
        `Identification of at-risk students;`,
        `Detection of missing assignments;`,
        `Engagement analysis; and`,
        `Report-generation assistance.`,
      ] },
      { type: "p", text: `AI outputs are generated using automated systems and may occasionally be incorrect, incomplete, inconsistent, biased, or unsuitable for a particular student or examination.` },
      { type: "p", text: `Accordingly:` },
      { type: "ol", items: [
        `AI-generated grades and feedback must be reviewed before being treated as final.`,
        `AI-generated examination questions must be reviewed for accuracy, syllabus alignment, duplication, appropriateness, and intellectual-property concerns.`,
        `At-risk indicators are support tools and must not be treated as diagnoses or definitive assessments of a student.`,
        `AI outputs must not be the sole basis for disciplinary action, removal from a course, or another significant decision affecting a student.`,
        `The teacher remains responsible for final academic decisions.`,
        `Sahahly does not guarantee that AI-generated content will be accepted by any examination board or educational institution.`,
        `Sahahly does not guarantee that AI-generated content will always be original or free from similarity to existing content.`,
      ] },
      { type: "p", text: `Where human quality control is included in the Customer's package, it provides an additional review layer but does not guarantee that every error will be identified.` },
    ],
  },
  {
    title: "10. Recordings",
    blocks: [
      { type: "p", text: `The Platform may store, organize, display, or process session recordings.` },
      { type: "p", text: `The Customer is responsible for:` },
      { type: "ul", items: [
        `Informing participants when sessions are recorded;`,
        `Obtaining all legally required consents;`,
        `Establishing an appropriate retention period;`,
        `Restricting recordings to authorized viewers;`,
        `Preventing unauthorized copying or distribution; and`,
        `Ensuring that recordings do not unlawfully contain confidential or third-party material.`,
      ] },
      { type: "p", text: `Users must not record, download, publish, or distribute another person's image, voice, lesson, or private information without proper authorization.` },
    ],
  },
  {
    title: "11. Student and Parent Communications",
    blocks: [
      { type: "p", text: `Sahahly may send reports, attendance alerts, progress updates, reminders, or other communications through WhatsApp, email, SMS, or similar channels.` },
      { type: "p", text: `The Customer must:` },
      { type: "ul", items: [
        `Provide accurate student and parent contact details;`,
        `Confirm the relationship between the student and the listed parent or guardian;`,
        `Obtain any necessary communication or marketing consent;`,
        `Inform Sahahly when a number or contact is no longer valid;`,
        `Review report recipients before sending; and`,
        `Avoid including unnecessary sensitive information in messages.`,
      ] },
      { type: "p", text: `Sahahly is not responsible for a report being delivered to an incorrect recipient where the Customer supplied incorrect, outdated, or improperly authorized contact details.` },
      { type: "p", text: `Operational messages relating to classes, assignments, attendance, account security, and service delivery may be different from promotional marketing communications.` },
    ],
  },
  {
    title: "12. User Content",
    blocks: [
      { type: "p", text: `Customers retain their ownership rights in User Content.` },
      { type: "p", text: `By uploading or submitting User Content, the Customer grants Sahahly a limited, non-exclusive right to host, store, copy, process, organize, display, transmit, analyze, and otherwise use that content only as reasonably necessary to:` },
      { type: "ul", items: [
        `Provide the services;`,
        `Operate and secure the Platform;`,
        `Complete correction and reporting workflows;`,
        `Provide customer support;`,
        `Prevent misuse;`,
        `Comply with legal obligations; and`,
        `Perform other activities described in the Privacy Policy or applicable Order.`,
      ] },
      { type: "p", text: `The Customer confirms that it has all required rights, permissions, licenses, and consents to submit the User Content to Sahahly.` },
      { type: "p", text: `This includes rights concerning:` },
      { type: "ul", items: [
        `Teaching materials;`,
        `Past-paper questions;`,
        `Mark schemes;`,
        `Student submissions;`,
        `Images and recordings;`,
        `Logos and branding;`,
        `Contact information; and`,
        `Third-party educational content.`,
      ] },
      { type: "p", text: `Sahahly may remove or restrict content when it reasonably believes that the content violates the law, these Terms, third-party rights, or examination-board requirements.` },
    ],
  },
  {
    title: "13. Intellectual Property",
    blocks: [
      { type: "p", text: `The Platform and its underlying technology are owned by or licensed to Sahahly.` },
      { type: "p", text: `This includes, where applicable:` },
      { type: "ul", items: [
        `Software and source code;`,
        `Platform architecture;`,
        `Artificial-intelligence systems and prompts;`,
        `Workflows and operating procedures;`,
        `Interfaces and dashboard designs;`,
        `Branding and logos;`,
        `Report templates;`,
        `Databases and data structures;`,
        `Documentation; and`,
        `Original content created by Sahahly.`,
      ] },
      { type: "p", text: `Except for the limited right to use the Platform during an active subscription, no intellectual-property rights are transferred to the Customer.` },
      { type: "p", text: `Users may not:` },
      { type: "ul", items: [
        `Copy or reproduce the Platform;`,
        `Reverse engineer or attempt to discover its source code;`,
        `Scrape or extract data in bulk;`,
        `Build a competing service using Sahahly's confidential systems;`,
        `Resell access without written authorization;`,
        `Remove copyright or ownership notices;`,
        `Copy Sahahly's workflows, templates, or interface for commercial use; or`,
        `Use Sahahly's name or logo without permission.`,
      ] },
      { type: "p", text: `Any feedback or suggestions voluntarily provided to Sahahly may be used to improve the services without creating an obligation to compensate the person providing the feedback.` },
    ],
  },
  {
    title: "14. Acceptable Use",
    blocks: [
      { type: "p", text: `Users must not use Sahahly to:` },
      { type: "ul", items: [
        `Break any applicable law;`,
        `Access another person's account without authorization;`,
        `Upload malware, viruses, or harmful code;`,
        `Interfere with the Platform's operation or security;`,
        `Circumvent subscription or usage restrictions;`,
        `Attempt to obtain unauthorized access to systems or data;`,
        `Harass, threaten, discriminate against, or exploit another person;`,
        `Publish false or defamatory information;`,
        `Impersonate another individual or organisation;`,
        `Submit content that infringes copyright or other rights;`,
        `Sell, transfer, or share accounts without authorization;`,
        `Distribute student data without proper authority;`,
        `Secretly record students, teachers, or parents;`,
        `Use AI features to facilitate cheating, academic dishonesty, or examination fraud;`,
        `Generate harmful, illegal, deceptive, or inappropriate content; or`,
        `Use the Platform in a way that could harm students or minors.`,
      ] },
      { type: "p", text: `Sahahly may investigate suspected misuse and cooperate with lawful regulatory or judicial requests.` },
    ],
  },
  {
    title: "15. Third-Party Services",
    blocks: [
      { type: "p", text: `Sahahly may integrate with or depend on third-party services such as:` },
      { type: "ul", items: [
        `WhatsApp or Meta services;`,
        `Video-conferencing platforms;`,
        `Cloud-hosting providers;`,
        `Payment processors;`,
        `Email or SMS providers;`,
        `Artificial-intelligence providers;`,
        `File-storage services; and`,
        `Authentication providers.`,
      ] },
      { type: "p", text: `Use of a third-party service may be subject to that provider's own terms and privacy policies.` },
      { type: "p", text: `Sahahly does not control third-party services and cannot guarantee their continuous availability, security, accuracy, or performance.` },
      { type: "p", text: `Sahahly may replace, remove, or modify integrations when necessary.` },
    ],
  },
  {
    title: "16. Fees, Billing and Taxes",
    blocks: [
      { type: "p", text: `Fees, billing periods, student limits, included services, payment dates, and other commercial terms will be stated in the applicable Order.` },
      { type: "p", text: `Unless otherwise stated:` },
      { type: "ul", items: [
        `Fees must be paid by the stated due date;`,
        `Fees exclude applicable taxes and governmental charges;`,
        `Customers must provide accurate billing information;`,
        `Failure to pay may result in suspension or reduced service access;`,
        `Usage beyond agreed limits may result in additional charges;`,
        `Pricing may change upon renewal after reasonable notice; and`,
        `Fees are non-refundable once a billing period or service has started, except where required by law or expressly stated in an Order.`,
      ] },
      { type: "p", text: `The Customer remains responsible for fees relating to services already performed before suspension, cancellation, or termination.` },
    ],
  },
  {
    title: "17. Privacy and Personal Data",
    blocks: [
      { type: "p", text: `Personal-data processing is governed by Sahahly's Privacy Policy and, where applicable, a Data Processing Agreement.` },
      { type: "p", text: `Depending on the processing activity:` },
      { type: "ul", items: [
        `The Customer may act as the controller of student, parent, assistant, and class data;`,
        `Sahahly may act as a processor carrying out the Customer's documented instructions; and`,
        `Sahahly may act as a separate controller for account administration, billing, security, legal compliance, and its own authorized communications.`,
      ] },
      { type: "p", text: `The Customer must ensure that it has an appropriate legal basis to collect and provide personal data to Sahahly.` },
      { type: "p", text: `For children's data, the Customer must obtain parental or legal-guardian authorization whenever required.` },
      { type: "p", text: `Customers should not upload unnecessary sensitive information. Where sensitive information must be processed, the Customer must notify Sahahly and ensure all required permissions and safeguards are in place.` },
      { type: "p", text: `Sahahly may use authorized service providers and subprocessors to operate the Platform. Further information about categories of data, retention, transfers, user rights, and subprocessors should be provided in the Privacy Policy and Data Processing Agreement.` },
    ],
  },
  {
    title: "18. Confidentiality",
    blocks: [
      { type: "p", text: `Each party must protect confidential information received from the other party and use it only for the agreed services.` },
      { type: "p", text: `Confidential information may include:` },
      { type: "ul", items: [
        `Student and parent data;`,
        `Grades and academic records;`,
        `Course materials;`,
        `Mark schemes;`,
        `Business and financial information;`,
        `Pricing and proposals;`,
        `Passwords and security information;`,
        `Platform documentation; and`,
        `Non-public workflows and technology.`,
      ] },
      { type: "p", text: `Confidentiality obligations do not apply to information that:` },
      { type: "ul", items: [
        `Is already publicly available without a breach;`,
        `Was lawfully known before disclosure;`,
        `Was received lawfully from another source;`,
        `Was independently developed; or`,
        `Must be disclosed by law or a competent authority.`,
      ] },
      { type: "p", text: `Where legally permitted, the receiving party will provide reasonable notice before a legally required disclosure.` },
    ],
  },
  {
    title: "19. Security",
    blocks: [
      { type: "p", text: `Sahahly will use reasonable administrative, organisational, and technical measures designed to protect information processed through the Platform.` },
      { type: "p", text: `However, no website, transmission method, storage system, or internet service can be guaranteed to be completely secure.` },
      { type: "p", text: `Customers must cooperate with reasonable security investigations and immediately report suspected breaches, unauthorized access, lost devices, or exposed credentials.` },
    ],
  },
  {
    title: "20. Platform Availability and Changes",
    blocks: [
      { type: "p", text: `Sahahly aims to provide reliable access but does not guarantee uninterrupted or error-free service.` },
      { type: "p", text: `Access may be temporarily restricted because of:` },
      { type: "ul", items: [
        `Maintenance;`,
        `Updates;`,
        `Security concerns;`,
        `Third-party outages;`,
        `Internet or infrastructure failures;`,
        `Legal or regulatory requirements;`,
        `Emergency repairs; or`,
        `Events beyond Sahahly's reasonable control.`,
      ] },
      { type: "p", text: `Sahahly may add, remove, modify, or replace features. Where a change materially reduces a paid core service, Sahahly will provide reasonable notice where practicable.` },
      { type: "p", text: `Features marked beta, preview, experimental, or under development may be changed or discontinued at any time and are provided without a service-level commitment unless agreed otherwise in writing.` },
    ],
  },
  {
    title: "21. Suspension and Termination",
    blocks: [
      { type: "p", text: `Sahahly may suspend or restrict access where reasonably necessary because of:` },
      { type: "ul", items: [
        `Overdue payment;`,
        `Breach of these Terms;`,
        `Security threats;`,
        `Suspected fraud or unauthorized access;`,
        `Illegal or harmful activity;`,
        `Misuse involving students or minors;`,
        `Intellectual-property complaints;`,
        `A regulatory or judicial request; or`,
        `Conduct that may harm Sahahly, its users, or the Platform.`,
      ] },
      { type: "p", text: `Where practicable, Sahahly will notify the Customer and provide an opportunity to remedy the issue.` },
      { type: "p", text: `Customers may terminate services according to their Order.` },
      { type: "p", text: `Following termination:` },
      { type: "ul", items: [
        `The Customer's right to access the Platform ends;`,
        `Outstanding fees remain payable;`,
        `Sahahly may provide a reasonable data-export period where included or agreed;`,
        `Data may be retained where required by law, dispute resolution, security, backup cycles, or legitimate record-keeping obligations; and`,
        `Data will otherwise be handled according to the Privacy Policy and Data Processing Agreement.`,
      ] },
      { type: "p", text: `Sections that by their nature should survive termination—including intellectual property, confidentiality, liability, payments, and dispute provisions—will remain effective.` },
    ],
  },
  {
    title: "22. Educational and Service Disclaimer",
    blocks: [
      { type: "p", text: `Sahahly is an operational and technology service. It is not an examination board, school, university, accreditation authority, or governmental educational institution.` },
      { type: "p", text: `Sahahly does not guarantee:` },
      { type: "ul", items: [
        `A particular student grade;`,
        `Examination success;`,
        `Improved academic performance;`,
        `Student attendance or engagement;`,
        `Acceptance of generated materials by an examination board;`,
        `Growth in student numbers;`,
        `Increased revenue; or`,
        `Any particular business outcome.`,
      ] },
      { type: "p", text: `Results depend on multiple factors outside Sahahly's control, including teacher decisions, student participation, materials supplied, internet access, and examination-board requirements.` },
    ],
  },
  {
    title: "23. Disclaimer of Warranties",
    blocks: [
      { type: "p", text: `To the maximum extent permitted by law, the Platform and services are provided on an "as available" basis.` },
      { type: "p", text: `Sahahly does not provide warranties that:` },
      { type: "ul", items: [
        `The Platform will always be available;`,
        `Every error will be corrected;`,
        `AI outputs will always be accurate;`,
        `Automated attendance will always identify every participant;`,
        `Reports will be free from all errors;`,
        `The Platform will satisfy every Customer's specific requirements; or`,
        `Third-party services will remain available.`,
      ] },
      { type: "p", text: `Nothing in these Terms limits warranties or consumer rights that cannot legally be excluded.` },
    ],
  },
  {
    title: "24. Limitation of Liability",
    blocks: [
      { type: "p", text: `To the maximum extent permitted by law, Sahahly will not be liable for indirect, incidental, special, punitive, or consequential loss, including loss of profits, opportunities, reputation, business, or anticipated savings.` },
      { type: "p", text: `Sahahly will not be responsible for loss resulting from:` },
      { type: "ul", items: [
        `Incorrect or incomplete Customer Data;`,
        `Failure to review grades or AI outputs;`,
        `Unauthorized account use caused by a Customer's failure to secure credentials;`,
        `Incorrect student or parent contact information;`,
        `Customer failure to obtain consent;`,
        `Unauthorized use of recordings or educational content;`,
        `Third-party services or outages;`,
        `Internet or device failures;`,
        `Examination-board decisions; or`,
        `Use of the Platform contrary to these Terms.`,
      ] },
      { type: "p", text: `To the maximum extent permitted by law, Sahahly's total aggregate liability relating to the services will not exceed the total fees paid by the affected Customer to Sahahly during the 12 months immediately preceding the event giving rise to the claim.` },
      { type: "p", text: `This limitation does not apply to fraud, deliberate misconduct, or another liability that cannot legally be limited or excluded.` },
    ],
  },
  {
    title: "25. Indemnification",
    blocks: [
      { type: "p", text: `To the extent permitted by law, the Customer agrees to protect and compensate Sahahly against third-party claims, losses, penalties, and reasonable legal costs resulting from:` },
      { type: "ul", items: [
        `Customer Data submitted without sufficient rights or consent;`,
        `Copyright or intellectual-property infringement caused by User Content;`,
        `Failure to obtain consent for student data or recordings;`,
        `Incorrect parent or student contact information;`,
        `Misuse of the Platform by the Customer or its Authorized Users;`,
        `Violation of applicable law; or`,
        `Material breach of these Terms.`,
      ] },
      { type: "p", text: `Sahahly will provide reasonable notice of a claim and allow the Customer to participate in its defence, provided that no settlement imposing liability or admission on Sahahly may be made without Sahahly's consent.` },
    ],
  },
  {
    title: "26. Force Majeure",
    blocks: [
      { type: "p", text: `Neither party will be responsible for delay or failure caused by events beyond its reasonable control, including natural disasters, war, civil disturbance, governmental action, widespread internet failure, electricity failure, telecommunications outages, cyberattacks, epidemics, labour disruptions, or third-party infrastructure failure.` },
      { type: "p", text: `The affected party will take reasonable steps to reduce the effect of the event and resume performance when practicable.` },
    ],
  },
  {
    title: "27. Changes to These Terms",
    blocks: [
      { type: "p", text: `Sahahly may update these Terms to reflect:` },
      { type: "ul", items: [
        `New features;`,
        `Service changes;`,
        `Security requirements;`,
        `Business developments;`,
        `Legal or regulatory changes; or`,
        `Improvements to user protection.`,
      ] },
      { type: "p", text: `The updated date will be displayed at the beginning of the Terms.` },
      { type: "p", text: `Where changes are material, Sahahly may provide notice through the Platform, the registered email address, or another reasonable communication method.` },
      { type: "p", text: `Continued use after the effective date of updated Terms constitutes acceptance, except where the law requires another form of consent.` },
    ],
  },
  {
    title: "28. Governing Law and Disputes",
    blocks: [
      { type: "p", text: `These Terms are governed by the laws of the Arab Republic of Egypt, without prejudice to any mandatory consumer rights that apply to a user.` },
      { type: "p", text: `Before initiating formal proceedings, the parties will attempt in good faith to resolve the dispute through written communication for at least 30 days.` },
      { type: "p", text: `If the dispute is not resolved, it will be submitted to the competent courts of Cairo, Egypt, unless mandatory law requires a different jurisdiction.` },
    ],
  },
  {
    title: "29. General Provisions",
    blocks: [
      { type: "p", text: `Entire agreement: These Terms, the applicable Order, Privacy Policy, and Data Processing Agreement constitute the agreement concerning the services.` },
      { type: "p", text: `Severability: If any provision is found invalid or unenforceable, the remaining provisions will remain effective.` },
      { type: "p", text: `No waiver: Failure to enforce a provision does not waive the right to enforce it later.` },
      { type: "p", text: `Assignment: The Customer may not transfer its agreement or account without Sahahly's prior written consent. Sahahly may assign the agreement as part of a restructuring, investment, merger, acquisition, or transfer of its business.` },
      { type: "p", text: `Independent parties: Nothing in these Terms creates an employment, agency, partnership, or joint-venture relationship.` },
      { type: "p", text: `Headings: Section headings are for convenience and do not affect interpretation.` },
    ],
  },
  {
    title: "30. Contact Information",
    blocks: [
      { type: "p", text: `Questions, complaints, or legal notices concerning these Terms may be sent to:` },
      { type: "ul", items: [
        `Privacy email: sahahlymanagment@gmail.com`,
        `WhatsApp: +20128 840 0059`,
        `Instagram: @Sahahlyteam`,
      ] },
    ],
  },
];

function renderBlocks(blocks) {
  return blocks.map((block, i) => {
    if (block.type === "p") return <p key={i}>{block.text}</p>;
    if (block.type === "ul")
      return (
        <ul key={i}>
          {block.items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>
      );
    if (block.type === "ol")
      return (
        <ol key={i}>
          {block.items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ol>
      );
    return null;
  });
}

export default function TermsOfUse() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="psp-page">
      <button
        type="button"
        className="psp-theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
      </button>

      <div className="psp-bg-orb psp-bg-orb--1" />
      <div className="psp-bg-orb psp-bg-orb--2" />

      <div className="psp-shell">
        <header className="psp-header">
          <Link to="/login" className="psp-back">
            <FiArrowLeft size={16} />
            Back to Login
          </Link>
          <img src={logo} alt="Sahahly" className="psp-logo" />
          <div className="psp-title-row">
            <span className="psp-title-icon" aria-hidden>
              <FiFileText size={22} />
            </span>
            <div>
              <h1>Sahahly Terms of Use</h1>
            </div>
          </div>
          {INTRO.map((text, i) => (
            <p className="psp-lead" key={i}>
              {text}
            </p>
          ))}
        </header>

        <article className="psp-content">
          {SECTIONS.map((section) => (
            <section className="psp-section" key={section.title}>
              <h2>{section.title}</h2>
              {renderBlocks(section.blocks)}
            </section>
          ))}
        </article>

        <footer className="psp-footer">
          <Link to="/login">Login</Link>
          <span aria-hidden>·</span>
          <span>© {new Date().getFullYear()} Sahahly</span>
        </footer>
      </div>
    </div>
  );
}
