const ROLE_OPTIONS = ['Project Responsible', 'Accountant', 'Co-ordinator', 'Finance Team'];
const FIXED_ROLE_BY_NAME = { 'Sivaram Sir': 'CMD' };

const DEFAULT_TEAM = [
  {
    "name": "Average Cost",
    "costPerHour": 800.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Sivaram Sir",
    "costPerHour": 2000.0,
    "billingCycle": "Yearly"
  },
  {
    "name": "Siddharth",
    "costPerHour": 950.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Thilothama",
    "costPerHour": 750.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Salma",
    "costPerHour": 800.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Sneha",
    "costPerHour": 850.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Nivetha",
    "costPerHour": 850.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Viknesh Raja",
    "costPerHour": 800.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Prathusha",
    "costPerHour": 700.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Rubiya",
    "costPerHour": 600.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Deepa K",
    "costPerHour": 1000.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Nivedha Acc",
    "costPerHour": 600.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Subiksha",
    "costPerHour": 450.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Iswarya Harini",
    "costPerHour": 450.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Bala Murugan",
    "costPerHour": 450.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Mohammed Shalih",
    "costPerHour": 450.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Sujitha",
    "costPerHour": 450.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Prem Kumar",
    "costPerHour": 450.0,
    "billingCycle": "Monthly"
  },
  {
    "name": "Hema Latha",
    "costPerHour": 450.0,
    "billingCycle": "Monthly"
  }
];

// Sourced from pricing.json (Zoho comprehensive toolkit, INR, last updated 2026-08-01).
// pricing.json gives one price per plan (no separate annual-billed discount),
// so monthly and yearly are equal here -- edit rates in Admin if yours differ.
const DEFAULT_TOOLS = [
  {
    "tool": "Zoho AlarmsOne",
    "domain": "Security_and_IT_Management",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 5 users — Centralized IT alert management."
  },
  {
    "tool": "Zoho AlarmsOne",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Centralized IT alert management."
  },
  {
    "tool": "Zoho AlarmsOne",
    "domain": "Security_and_IT_Management",
    "edition": "Professional",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Centralized IT alert management."
  },
  {
    "tool": "Zoho Analytics",
    "domain": "BI_and_Analytics",
    "edition": "Standard",
    "monthly": 1500,
    "yearly": 1500,
    "notes": "per user/month — Modern self-service BI and analytics platform."
  },
  {
    "tool": "Zoho Analytics",
    "domain": "BI_and_Analytics",
    "edition": "Professional",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per user/month — Modern self-service BI and analytics platform."
  },
  {
    "tool": "Zoho Analytics Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per user/month — AI-powered unified analytics platform to correlate all IT data."
  },
  {
    "tool": "Zoho Analytics Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 6000,
    "yearly": 6000,
    "notes": "per user/month — AI-powered unified analytics platform to correlate all IT data."
  },
  {
    "tool": "Zoho Apptics",
    "domain": "Developer_Platforms",
    "edition": "Starter",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per app/month — Application analytics for all apps."
  },
  {
    "tool": "Zoho Apptics",
    "domain": "Developer_Platforms",
    "edition": "Professional",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per app/month — Application analytics for all apps."
  },
  {
    "tool": "Zoho Assist",
    "domain": "Service",
    "edition": "Standard",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — Remote support and unattended remote access software."
  },
  {
    "tool": "Zoho Assist",
    "domain": "Service",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Remote support and unattended remote access software."
  },
  {
    "tool": "Zoho Backstage",
    "domain": "Marketing",
    "edition": "Starter",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — End-to-end event management software."
  },
  {
    "tool": "Zoho Backstage",
    "domain": "Marketing",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — End-to-end event management software."
  },
  {
    "tool": "Zoho Bigin",
    "domain": "Sales",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 10 users — Simple CRM for small businesses moving from spreadsheets."
  },
  {
    "tool": "Zoho Bigin",
    "domain": "Sales",
    "edition": "Growth",
    "monthly": 450,
    "yearly": 450,
    "notes": "per user/month — Simple CRM for small businesses moving from spreadsheets."
  },
  {
    "tool": "Zoho Billing",
    "domain": "Finance",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — End-to-end billing solution for your business."
  },
  {
    "tool": "Zoho Billing",
    "domain": "Finance",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — End-to-end billing solution for your business."
  },
  {
    "tool": "Zoho Bookings",
    "domain": "Sales",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 5 users — Appointment scheduling app for consultations with customers."
  },
  {
    "tool": "Zoho Bookings",
    "domain": "Sales",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Appointment scheduling app for consultations with customers."
  },
  {
    "tool": "Zoho Books",
    "domain": "Finance",
    "edition": "Basic",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per month — Powerful accounting platform for growing businesses."
  },
  {
    "tool": "Zoho Books",
    "domain": "Finance",
    "edition": "Standard",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per month — Powerful accounting platform for growing businesses."
  },
  {
    "tool": "Zoho Books",
    "domain": "Finance",
    "edition": "Professional",
    "monthly": 4500,
    "yearly": 4500,
    "notes": "per month — Powerful accounting platform for growing businesses."
  },
  {
    "tool": "Zoho BugTracker",
    "domain": "Project_Management",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 10 users — Automatic bug tracking software for managing bugs."
  },
  {
    "tool": "Zoho BugTracker",
    "domain": "Project_Management",
    "edition": "Premium",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Automatic bug tracking software for managing bugs."
  },
  {
    "tool": "Zoho Calendar",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Online business calendar to manage events and schedule appointments."
  },
  {
    "tool": "Zoho Calendar",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Online business calendar to manage events and schedule appointments."
  },
  {
    "tool": "Zoho Campaigns",
    "domain": "Marketing",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 12,000 emails/month — Create, send, and track targeted email campaigns that drive sales."
  },
  {
    "tool": "Zoho Campaigns",
    "domain": "Marketing",
    "edition": "Standard",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Create, send, and track targeted email campaigns that drive sales."
  },
  {
    "tool": "Zoho Campaigns",
    "domain": "Marketing",
    "edition": "Professional",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Create, send, and track targeted email campaigns that drive sales."
  },
  {
    "tool": "Zoho Catalyst",
    "domain": "Developer_Platforms",
    "edition": "Pay-as-you-go",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per million requests — Pro-code platform to build and deploy your apps."
  },
  {
    "tool": "Zoho Checkout",
    "domain": "Finance",
    "edition": "Transaction Fee",
    "monthly": 180,
    "yearly": 180,
    "notes": "per transaction (2.9% + ₹180) — Collect payments online with custom branded pages."
  },
  {
    "tool": "Zoho Cliq",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Stay in touch with teams no matter where you are."
  },
  {
    "tool": "Zoho Cliq",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Stay in touch with teams no matter where you are."
  },
  {
    "tool": "Zoho CloudDNS",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 300,
    "yearly": 300,
    "notes": "per domain/month — Optimize your domains for speed, security, and controlled name resolution."
  },
  {
    "tool": "Zoho CloudSpend",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Cloud cost management for modern software teams."
  },
  {
    "tool": "Zoho CloudSpend",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — Cloud cost management for modern software teams."
  },
  {
    "tool": "Zoho Commerce",
    "domain": "Commerce_and_POS",
    "edition": "Basic",
    "monthly": 900,
    "yearly": 900,
    "notes": "per month — eCommerce platform to manage and market your online store."
  },
  {
    "tool": "Zoho Commerce",
    "domain": "Commerce_and_POS",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per month — eCommerce platform to manage and market your online store."
  },
  {
    "tool": "Zoho Commerce",
    "domain": "Commerce_and_POS",
    "edition": "Enterprise",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per month — eCommerce platform to manage and market your online store."
  },
  {
    "tool": "Zoho CommunitySpaces",
    "domain": "Marketing",
    "edition": "Starter",
    "monthly": 900,
    "yearly": 900,
    "notes": "per community/month — Online community platform for individuals and businesses to grow their network and brand."
  },
  {
    "tool": "Zoho CommunitySpaces",
    "domain": "Marketing",
    "edition": "Growth",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per community/month — Online community platform for individuals and businesses to grow their network and brand."
  },
  {
    "tool": "Zoho Connect",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Enterprise",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Employee experience intranet for informed, engaged, and connected employees."
  },
  {
    "tool": "Zoho Contracts",
    "domain": "Legal",
    "edition": "Standard",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Comprehensive contract lifecycle management software."
  },
  {
    "tool": "Zoho Contracts",
    "domain": "Legal",
    "edition": "Enterprise",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per user/month — Comprehensive contract lifecycle management software."
  },
  {
    "tool": "Zoho Creator",
    "domain": "Developer_Platforms",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 1000 records — AI-powered platform to build custom business apps."
  },
  {
    "tool": "Zoho Creator",
    "domain": "Developer_Platforms",
    "edition": "Premium",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — AI-powered platform to build custom business apps."
  },
  {
    "tool": "Zoho Creator Plus",
    "domain": "Developer_Platforms",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Unified platform for the entire app development lifecycle."
  },
  {
    "tool": "Zoho Creator Plus",
    "domain": "Developer_Platforms",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — Unified platform for the entire app development lifecycle."
  },
  {
    "tool": "Zoho CRM",
    "domain": "Sales",
    "edition": "Standard",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Comprehensive CRM platform for customer-facing teams."
  },
  {
    "tool": "Zoho CRM",
    "domain": "Sales",
    "edition": "Professional",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — Comprehensive CRM platform for customer-facing teams."
  },
  {
    "tool": "Zoho CRM",
    "domain": "Sales",
    "edition": "Enterprise",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Comprehensive CRM platform for customer-facing teams."
  },
  {
    "tool": "Zoho CRM Plus",
    "domain": "Sales",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Unified platform to deliver top-notch customer experience."
  },
  {
    "tool": "Zoho CRM Plus",
    "domain": "Sales",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Unified platform to deliver top-notch customer experience."
  },
  {
    "tool": "Zoho DAP",
    "domain": "Project_Management",
    "edition": "Growth",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Platform to simplify software adoption with in-product guidance."
  },
  {
    "tool": "Zoho DAP",
    "domain": "Project_Management",
    "edition": "Growth",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Platform to simplify software adoption with in-product guidance."
  },
  {
    "tool": "Zoho DAP",
    "domain": "Project_Management",
    "edition": "Enterprise",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — Platform to simplify software adoption with in-product guidance."
  },
  {
    "tool": "Zoho DAP",
    "domain": "Project_Management",
    "edition": "Enterprise",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — Platform to simplify software adoption with in-product guidance."
  },
  {
    "tool": "Zoho DataPrep",
    "domain": "Developer_Platforms",
    "edition": "Standard",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — AI-powered ETL tool for effective data integration and movement."
  },
  {
    "tool": "Zoho DataPrep",
    "domain": "Developer_Platforms",
    "edition": "Enterprise",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per user/month — AI-powered ETL tool for effective data integration and movement."
  },
  {
    "tool": "Zoho Desk",
    "domain": "Service",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 3 agents — Helpdesk software to deliver great customer support."
  },
  {
    "tool": "Zoho Desk",
    "domain": "Service",
    "edition": "Standard",
    "monthly": 900,
    "yearly": 900,
    "notes": "per agent/month — Helpdesk software to deliver great customer support."
  },
  {
    "tool": "Zoho Desk",
    "domain": "Service",
    "edition": "Professional",
    "monthly": 1500,
    "yearly": 1500,
    "notes": "per agent/month — Helpdesk software to deliver great customer support."
  },
  {
    "tool": "Zoho Desk",
    "domain": "Service",
    "edition": "Enterprise",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per agent/month — Helpdesk software to deliver great customer support."
  },
  {
    "tool": "Zoho DEX Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Cloud-based DEX solution to monitor, diagnose, and improve device performance and employee experience."
  },
  {
    "tool": "Zoho DEX Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per user/month — Cloud-based DEX solution to monitor, diagnose, and improve device performance and employee experience."
  },
  {
    "tool": "Zoho Digital Risk Analyzer",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 6000,
    "yearly": 6000,
    "notes": "per month — All-in-one digital risk assessment tool to ensure domain security."
  },
  {
    "tool": "Zoho Directory",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Workforce identity and access management solution for cloud businesses."
  },
  {
    "tool": "Zoho Directory",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Workforce identity and access management solution for cloud businesses."
  },
  {
    "tool": "Zoho Domains",
    "domain": "Marketing",
    "edition": "Premium DNS",
    "monthly": 300,
    "yearly": 300,
    "notes": "per domain/year — Easy domain registration, transfer, and secured DNS management."
  },
  {
    "tool": "Zoho Domains",
    "domain": "Marketing",
    "edition": "Registration",
    "monthly": 600,
    "yearly": 600,
    "notes": "per domain/year — Easy domain registration, transfer, and secured DNS management."
  },
  {
    "tool": "Zoho Embedded BI",
    "domain": "Developer_Platforms",
    "edition": "Quote-based",
    "monthly": "Custom",
    "yearly": "Custom",
    "notes": "based on usage — Embedded analytics and white label BI solutions, tailored for your needs."
  },
  {
    "tool": "Zoho Endpoint Central",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — A 360-degree UEM solution for endpoint management and security."
  },
  {
    "tool": "Zoho Endpoint Central",
    "domain": "Security_and_IT_Management",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — A 360-degree UEM solution for endpoint management and security."
  },
  {
    "tool": "Zoho eProtect",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Comprehensive email security and archiving for every business."
  },
  {
    "tool": "Zoho eProtect",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Comprehensive email security and archiving for every business."
  },
  {
    "tool": "Zoho Expense",
    "domain": "Finance",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 3 users — Effortless expense reporting platform."
  },
  {
    "tool": "Zoho Expense",
    "domain": "Finance",
    "edition": "Premium",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Effortless expense reporting platform."
  },
  {
    "tool": "Zoho Finance Plus",
    "domain": "Finance",
    "edition": "Professional",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per user/month — All-in-one suite to manage your operations and finances."
  },
  {
    "tool": "Zoho Finance Plus",
    "domain": "Finance",
    "edition": "Enterprise",
    "monthly": 4500,
    "yearly": 4500,
    "notes": "per user/month — All-in-one suite to manage your operations and finances."
  },
  {
    "tool": "Zoho Flow",
    "domain": "Developer_Platforms",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 1000 tasks/month — Automate business workflows by creating smart integrations."
  },
  {
    "tool": "Zoho Flow",
    "domain": "Developer_Platforms",
    "edition": "Standard",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — Automate business workflows by creating smart integrations."
  },
  {
    "tool": "Zoho Flow",
    "domain": "Developer_Platforms",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Automate business workflows by creating smart integrations."
  },
  {
    "tool": "Zoho Forms",
    "domain": "Sales",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 100 responses/month — Build online forms for every business need."
  },
  {
    "tool": "Zoho Forms",
    "domain": "Sales",
    "edition": "Basic",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Build online forms for every business need."
  },
  {
    "tool": "Zoho Forms",
    "domain": "Sales",
    "edition": "Premium",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Build online forms for every business need."
  },
  {
    "tool": "Zoho FSM",
    "domain": "Service",
    "edition": "Professional",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — End-to-end field service management platform for service businesses."
  },
  {
    "tool": "Zoho FSM",
    "domain": "Service",
    "edition": "Enterprise",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — End-to-end field service management platform for service businesses."
  },
  {
    "tool": "Zoho Identity360",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — Cloud-native identity platform redefining workforce IAM."
  },
  {
    "tool": "Zoho Identity360",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Cloud-native identity platform redefining workforce IAM."
  },
  {
    "tool": "Zoho Inventory",
    "domain": "Finance",
    "edition": "Standard",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — Powerful stock management and inventory control software."
  },
  {
    "tool": "Zoho Inventory",
    "domain": "Finance",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Powerful stock management and inventory control software."
  },
  {
    "tool": "Zoho Invoice",
    "domain": "Finance",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "per user/month — 100% Free invoicing solution."
  },
  {
    "tool": "Zoho IoT",
    "domain": "IoT",
    "edition": "Pay-as-you-go",
    "monthly": 1500,
    "yearly": 1500,
    "notes": "per million messages — Build, deploy, and scale IoT solutions for connected businesses."
  },
  {
    "tool": "Zoho Key Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per user/month — Zero touch certificate lifecycle management platform for all your public and private CA SSL/TLS certificates."
  },
  {
    "tool": "Zoho Key Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 7200,
    "yearly": 7200,
    "notes": "per user/month — Zero touch certificate lifecycle management platform for all your public and private CA SSL/TLS certificates."
  },
  {
    "tool": "Zoho LandingPage",
    "domain": "Marketing",
    "edition": "Professional",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — Smart landing page builder to increase conversion rates."
  },
  {
    "tool": "Zoho LandingPage",
    "domain": "Marketing",
    "edition": "Enterprise",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Smart landing page builder to increase conversion rates."
  },
  {
    "tool": "Zoho LeadChain",
    "domain": "Marketing",
    "edition": "Professional",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Sync, manage, and convert leads across channels seamlessly."
  },
  {
    "tool": "Zoho LeadChain",
    "domain": "Marketing",
    "edition": "Enterprise",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — Sync, manage, and convert leads across channels seamlessly."
  },
  {
    "tool": "Zoho Learn",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Professional",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — Knowledge and learning management platform."
  },
  {
    "tool": "Zoho Learn",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Enterprise",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Knowledge and learning management platform."
  },
  {
    "tool": "Zoho Lens",
    "domain": "Service",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Interactive remote assistance software with augmented reality."
  },
  {
    "tool": "Zoho Lens",
    "domain": "Service",
    "edition": "Enterprise",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per user/month — Interactive remote assistance software with augmented reality."
  },
  {
    "tool": "Zoho Log360 Cloud",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 30000,
    "yearly": 30000,
    "notes": "per year — Detect, investigate, and neutralize security threats with a cloud SIEM solution."
  },
  {
    "tool": "Zoho Log360 Cloud",
    "domain": "Security_and_IT_Management",
    "edition": "Professional",
    "monthly": 60000,
    "yearly": 60000,
    "notes": "per year — Detect, investigate, and neutralize security threats with a cloud SIEM solution."
  },
  {
    "tool": "Zoho Mail",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Standard",
    "monthly": 90,
    "yearly": 90,
    "notes": "per user/month — Secure email service for teams of all sizes."
  },
  {
    "tool": "Zoho Mail",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Professional",
    "monthly": 150,
    "yearly": 150,
    "notes": "per user/month — Secure email service for teams of all sizes."
  },
  {
    "tool": "Zoho Marketing Automation",
    "domain": "Marketing",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — All-in-one marketing automation software."
  },
  {
    "tool": "Zoho Marketing Automation",
    "domain": "Marketing",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — All-in-one marketing automation software."
  },
  {
    "tool": "Zoho Marketing Plus",
    "domain": "Marketing",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Unified marketing platform for marketing teams."
  },
  {
    "tool": "Zoho Marketing Plus",
    "domain": "Marketing",
    "edition": "Enterprise",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per user/month — Unified marketing platform for marketing teams."
  },
  {
    "tool": "Zoho MCP",
    "domain": "Developer_Platforms",
    "edition": "Quote-based",
    "monthly": "Custom",
    "yearly": "Custom",
    "notes": "based on usage — Make apps agent-ready, build agentic workflows, and get work done with prompts."
  },
  {
    "tool": "Zoho Meeting",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 100 participants — Online meeting software for your video conferencing needs."
  },
  {
    "tool": "Zoho Meeting",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Professional",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Online meeting software for your video conferencing needs."
  },
  {
    "tool": "Zoho Mobile Device Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per device/year — Set up and secure your enterprise mobile devices and apps."
  },
  {
    "tool": "Zoho Mobile Device Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per device/year — Set up and secure your enterprise mobile devices and apps."
  },
  {
    "tool": "Zoho Notebook",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Beautiful home for all your notes."
  },
  {
    "tool": "Zoho Notebook",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Pro",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Beautiful home for all your notes."
  },
  {
    "tool": "Zoho Office Integrator",
    "domain": "Developer_Platforms",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Built-in document editors for web apps."
  },
  {
    "tool": "Zoho Office Integrator",
    "domain": "Developer_Platforms",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Built-in document editors for web apps."
  },
  {
    "tool": "Zoho Office Suite",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Powerful collaborative work platform for teams."
  },
  {
    "tool": "Zoho Office Suite",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Powerful collaborative work platform for teams."
  },
  {
    "tool": "Zoho OneAuth",
    "domain": "Security_and_IT_Management",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Secure multi-factor authenticator (MFA) for all your online accounts."
  },
  {
    "tool": "Zoho PageSense",
    "domain": "Marketing",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per property/month — Website conversion optimization and personalization platform."
  },
  {
    "tool": "Zoho PageSense",
    "domain": "Marketing",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per property/month — Website conversion optimization and personalization platform."
  },
  {
    "tool": "Zoho Patch Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 6000,
    "yearly": 6000,
    "notes": "per year — Automated multi-OS patch management."
  },
  {
    "tool": "Zoho Patch Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Professional",
    "monthly": 12000,
    "yearly": 12000,
    "notes": "per year — Automated multi-OS patch management."
  },
  {
    "tool": "Zoho Payments",
    "domain": "Finance",
    "edition": "Transaction Fee",
    "monthly": 180,
    "yearly": 180,
    "notes": "per transaction (2.9% + ₹180) — Unified payment solution built for all businesses."
  },
  {
    "tool": "Zoho Payroll",
    "domain": "Finance",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per employee/month — Effortless payroll processing software for businesses."
  },
  {
    "tool": "Zoho Payroll",
    "domain": "Finance",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per employee/month — Effortless payroll processing software for businesses."
  },
  {
    "tool": "Zoho PDF Editor",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Collaborative online PDF editing tool."
  },
  {
    "tool": "Zoho PDF Editor",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Collaborative online PDF editing tool."
  },
  {
    "tool": "Zoho People",
    "domain": "Human_Resources",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per employee/month — Organize, automate, and simplify your HR processes."
  },
  {
    "tool": "Zoho People",
    "domain": "Human_Resources",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per employee/month — Organize, automate, and simplify your HR processes."
  },
  {
    "tool": "Zoho People Plus",
    "domain": "Human_Resources",
    "edition": "Standard",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per employee/month — Comprehensive HR platform for seamless employee experiences."
  },
  {
    "tool": "Zoho People Plus",
    "domain": "Human_Resources",
    "edition": "Professional",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per employee/month — Comprehensive HR platform for seamless employee experiences."
  },
  {
    "tool": "Zoho POS",
    "domain": "Commerce_and_POS",
    "edition": "Basic",
    "monthly": 750,
    "yearly": 750,
    "notes": "per location/month — Modern retail POS to sell better, manage your entire business, and join the digital revolution."
  },
  {
    "tool": "Zoho POS",
    "domain": "Commerce_and_POS",
    "edition": "Standard",
    "monthly": 1500,
    "yearly": 1500,
    "notes": "per location/month — Modern retail POS to sell better, manage your entire business, and join the digital revolution."
  },
  {
    "tool": "Zoho POS",
    "domain": "Commerce_and_POS",
    "edition": "Premium",
    "monthly": 2250,
    "yearly": 2250,
    "notes": "per location/month — Modern retail POS to sell better, manage your entire business, and join the digital revolution."
  },
  {
    "tool": "Zoho Practice",
    "domain": "Finance",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Practice management software for accounting firms."
  },
  {
    "tool": "Zoho Practice",
    "domain": "Finance",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — Practice management software for accounting firms."
  },
  {
    "tool": "Zoho Procurement",
    "domain": "Finance",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Complete source-to-pay platform to transform your procurement into a growth engine."
  },
  {
    "tool": "Zoho Procurement",
    "domain": "Finance",
    "edition": "Enterprise",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per user/month — Complete source-to-pay platform to transform your procurement into a growth engine."
  },
  {
    "tool": "Zoho Projects",
    "domain": "Project_Management",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 3 users — Manage, track, and collaborate on projects with teams."
  },
  {
    "tool": "Zoho Projects",
    "domain": "Project_Management",
    "edition": "Premium",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Manage, track, and collaborate on projects with teams."
  },
  {
    "tool": "Zoho Projects Plus",
    "domain": "Project_Management",
    "edition": "Standard",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Unified project management platform for intelligent, data-driven work."
  },
  {
    "tool": "Zoho Projects Plus",
    "domain": "Project_Management",
    "edition": "Professional",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per user/month — Unified project management platform for intelligent, data-driven work."
  },
  {
    "tool": "Zoho Publish",
    "domain": "Marketing",
    "edition": "Starter",
    "monthly": 600,
    "yearly": 600,
    "notes": "per location/month — Manage all your local business listings on a single platform."
  },
  {
    "tool": "Zoho Publish",
    "domain": "Marketing",
    "edition": "Professional",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per location/month — Manage all your local business listings on a single platform."
  },
  {
    "tool": "Zoho QEngine",
    "domain": "Developer_Platforms",
    "edition": "Standard",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Test automation software to build, manage, execute, and report test cases."
  },
  {
    "tool": "Zoho QEngine",
    "domain": "Developer_Platforms",
    "edition": "Enterprise",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per user/month — Test automation software to build, manage, execute, and report test cases."
  },
  {
    "tool": "Zoho Recruit",
    "domain": "Human_Resources",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Intuitive recruiting platform built to provide hiring solutions."
  },
  {
    "tool": "Zoho Recruit",
    "domain": "Human_Resources",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — Intuitive recruiting platform built to provide hiring solutions."
  },
  {
    "tool": "Zoho Remote Access Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Secure and comprehensive unattended access at the click of your mouse."
  },
  {
    "tool": "Zoho Remote Access Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per user/month — Secure and comprehensive unattended access at the click of your mouse."
  },
  {
    "tool": "Zoho RouteIQ",
    "domain": "Sales",
    "edition": "Starter",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Comprehensive sales map visualization and optimal route planning solution."
  },
  {
    "tool": "Zoho RouteIQ",
    "domain": "Sales",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — Comprehensive sales map visualization and optimal route planning solution."
  },
  {
    "tool": "Zoho RPA",
    "domain": "Developer_Platforms",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per bot/month — Automate manual, tedious, and repetitive tasks easily."
  },
  {
    "tool": "Zoho RPA",
    "domain": "Developer_Platforms",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per bot/month — Automate manual, tedious, and repetitive tasks easily."
  },
  {
    "tool": "Zoho Saas Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — SaaS management platform to maximize ROI."
  },
  {
    "tool": "Zoho Saas Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 3600,
    "yearly": 3600,
    "notes": "per user/month — SaaS management platform to maximize ROI."
  },
  {
    "tool": "Zoho SalesIQ",
    "domain": "Sales",
    "edition": "Basic",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — Live chat app to engage and convert website visitors."
  },
  {
    "tool": "Zoho SalesIQ",
    "domain": "Sales",
    "edition": "Professional",
    "monthly": 1500,
    "yearly": 1500,
    "notes": "per user/month — Live chat app to engage and convert website visitors."
  },
  {
    "tool": "Zoho SalesIQ",
    "domain": "Sales",
    "edition": "Enterprise",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per user/month — Live chat app to engage and convert website visitors."
  },
  {
    "tool": "Zoho Service Plus",
    "domain": "Service",
    "edition": "Standard",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Unified platform for customer service and support teams."
  },
  {
    "tool": "Zoho Service Plus",
    "domain": "Service",
    "edition": "Professional",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per user/month — Unified platform for customer service and support teams."
  },
  {
    "tool": "Zoho ServiceDesk Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per technician/month — Cloud-based IT ticketing system to resolve issues faster."
  },
  {
    "tool": "Zoho ServiceDesk Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per technician/month — Cloud-based IT ticketing system to resolve issues faster."
  },
  {
    "tool": "Zoho Sheet",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Spreadsheet software for collaborative teams."
  },
  {
    "tool": "Zoho Sheet",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Spreadsheet software for collaborative teams."
  },
  {
    "tool": "Zoho Shifts",
    "domain": "Human_Resources",
    "edition": "Standard",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Employee scheduling and time tracking app."
  },
  {
    "tool": "Zoho Shifts",
    "domain": "Human_Resources",
    "edition": "Professional",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Employee scheduling and time tracking app."
  },
  {
    "tool": "Zoho Show",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Create, edit, and share slides with a sleek presentation app."
  },
  {
    "tool": "Zoho Show",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Create, edit, and share slides with a sleek presentation app."
  },
  {
    "tool": "Zoho Sign",
    "domain": "Sales",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 5 documents/month — Digital signature app for businesses."
  },
  {
    "tool": "Zoho Sign",
    "domain": "Sales",
    "edition": "Standard",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Digital signature app for businesses."
  },
  {
    "tool": "Zoho Sign",
    "domain": "Sales",
    "edition": "Premium",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Digital signature app for businesses."
  },
  {
    "tool": "Zoho Site24x7",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per month — All-in-one monitoring solution for DevOps and IT Operations."
  },
  {
    "tool": "Zoho Site24x7",
    "domain": "Security_and_IT_Management",
    "edition": "Professional",
    "monthly": 6000,
    "yearly": 6000,
    "notes": "per month — All-in-one monitoring solution for DevOps and IT Operations."
  },
  {
    "tool": "Zoho Site24x7",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 12000,
    "yearly": 12000,
    "notes": "per month — All-in-one monitoring solution for DevOps and IT Operations."
  },
  {
    "tool": "Zoho Sites",
    "domain": "Marketing",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "with Zoho branding — Online website builder with extensive customization options."
  },
  {
    "tool": "Zoho Sites",
    "domain": "Marketing",
    "edition": "Premium",
    "monthly": 600,
    "yearly": 600,
    "notes": "per site/month — Online website builder with extensive customization options."
  },
  {
    "tool": "Zoho Social",
    "domain": "Marketing",
    "edition": "Professional",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — All-in-one social media management software."
  },
  {
    "tool": "Zoho Social",
    "domain": "Marketing",
    "edition": "Enterprise",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — All-in-one social media management software."
  },
  {
    "tool": "Zoho Spend",
    "domain": "Finance",
    "edition": "Standard",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Manage and control every business spend from a single unified platform."
  },
  {
    "tool": "Zoho Spend",
    "domain": "Finance",
    "edition": "Professional",
    "monthly": 2400,
    "yearly": 2400,
    "notes": "per user/month — Manage and control every business spend from a single unified platform."
  },
  {
    "tool": "Zoho Sprints",
    "domain": "Project_Management",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 10 users — Scalable Agile software for faster and smarter delivery."
  },
  {
    "tool": "Zoho Sprints",
    "domain": "Project_Management",
    "edition": "Premium",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — Scalable Agile software for faster and smarter delivery."
  },
  {
    "tool": "Zoho StatusIQ",
    "domain": "Security_and_IT_Management",
    "edition": "Starter",
    "monthly": 1500,
    "yearly": 1500,
    "notes": "per month — Status page for real-time status and incident communication."
  },
  {
    "tool": "Zoho StatusIQ",
    "domain": "Security_and_IT_Management",
    "edition": "Professional",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per month — Status page for real-time status and incident communication."
  },
  {
    "tool": "Zoho StatusIQ",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 6000,
    "yearly": 6000,
    "notes": "per month — Status page for real-time status and incident communication."
  },
  {
    "tool": "Zoho Survey",
    "domain": "Marketing",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 10 questions/survey — Design surveys to reach and interact with your audience."
  },
  {
    "tool": "Zoho Survey",
    "domain": "Marketing",
    "edition": "Basic",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Design surveys to reach and interact with your audience."
  },
  {
    "tool": "Zoho Survey",
    "domain": "Marketing",
    "edition": "Premium",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Design surveys to reach and interact with your audience."
  },
  {
    "tool": "Zoho Tables",
    "domain": "Developer_Platforms",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 10 collaborators — Modern spreadsheet-database hybrid to organize work and data."
  },
  {
    "tool": "Zoho Tables",
    "domain": "Developer_Platforms",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Modern spreadsheet-database hybrid to organize work and data."
  },
  {
    "tool": "Zoho TeamInbox",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 3 team members — Shared inboxes for teams."
  },
  {
    "tool": "Zoho TeamInbox",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Shared inboxes for teams."
  },
  {
    "tool": "Zoho Thrive",
    "domain": "Sales",
    "edition": "Starter",
    "monthly": 1500,
    "yearly": 1500,
    "notes": "per month — Loyalty platform to reward, retain, and grow your customer base."
  },
  {
    "tool": "Zoho Thrive",
    "domain": "Sales",
    "edition": "Growth",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per month — Loyalty platform to reward, retain, and grow your customer base."
  },
  {
    "tool": "Zoho Thrive",
    "domain": "Sales",
    "edition": "Enterprise",
    "monthly": 6000,
    "yearly": 6000,
    "notes": "per month — Loyalty platform to reward, retain, and grow your customer base."
  },
  {
    "tool": "Zoho ToDo",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Collaborative task management for individuals and teams."
  },
  {
    "tool": "Zoho ToDo",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Pro",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Collaborative task management for individuals and teams."
  },
  {
    "tool": "Zoho Toolkit",
    "domain": "Security_and_IT_Management",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Complete resource for any admin-related lookup queries."
  },
  {
    "tool": "Zoho Ulaa",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Secure your business with built-in browser protection and control."
  },
  {
    "tool": "Zoho Ulaa",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Secure your business with built-in browser protection and control."
  },
  {
    "tool": "Zoho Vani",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Starter",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — A visual collaboration platform for teams."
  },
  {
    "tool": "Zoho Vani",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Professional",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — A visual collaboration platform for teams."
  },
  {
    "tool": "Zoho Vault",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Online password manager for teams."
  },
  {
    "tool": "Zoho Vault",
    "domain": "Security_and_IT_Management",
    "edition": "Professional",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Online password manager for teams."
  },
  {
    "tool": "Zoho Vertical Studio",
    "domain": "Developer_Platforms",
    "edition": "Quote-based",
    "monthly": "Custom",
    "yearly": "Custom",
    "notes": "based on usage — Build secure, scalable, and multi-tenant apps for any industry."
  },
  {
    "tool": "Zoho Vulnerability Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Standard",
    "monthly": 36000,
    "yearly": 36000,
    "notes": "per year — Identify, prioritize, and remediate vulnerabilities across your entire network."
  },
  {
    "tool": "Zoho Vulnerability Manager Plus",
    "domain": "Security_and_IT_Management",
    "edition": "Enterprise",
    "monthly": 72000,
    "yearly": 72000,
    "notes": "per year — Identify, prioritize, and remediate vulnerabilities across your entire network."
  },
  {
    "tool": "Zoho Webinar",
    "domain": "Marketing",
    "edition": "Starter",
    "monthly": 900,
    "yearly": 900,
    "notes": "per host/month — Webinar platform for webcasting online webinars."
  },
  {
    "tool": "Zoho Webinar",
    "domain": "Marketing",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per host/month — Webinar platform for webcasting online webinars."
  },
  {
    "tool": "Zoho Webinar",
    "domain": "Marketing",
    "edition": "Enterprise",
    "monthly": 3000,
    "yearly": 3000,
    "notes": "per host/month — Webinar platform for webcasting online webinars."
  },
  {
    "tool": "Zoho WorkDrive",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 5 users & 1TB — Online file management for teams."
  },
  {
    "tool": "Zoho WorkDrive",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Standard",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Online file management for teams."
  },
  {
    "tool": "Zoho WorkDrive",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Premium",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Online file management for teams."
  },
  {
    "tool": "Zoho Workerly",
    "domain": "Human_Resources",
    "edition": "Standard",
    "monthly": 900,
    "yearly": 900,
    "notes": "per user/month — Manage temporary staffing with an employee scheduling solution."
  },
  {
    "tool": "Zoho Workerly",
    "domain": "Human_Resources",
    "edition": "Professional",
    "monthly": 1800,
    "yearly": 1800,
    "notes": "per user/month — Manage temporary staffing with an employee scheduling solution."
  },
  {
    "tool": "Zoho Workplace",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Standard",
    "monthly": 600,
    "yearly": 600,
    "notes": "per user/month — Application suite built to improve team productivity and collaboration."
  },
  {
    "tool": "Zoho Workplace",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Premium",
    "monthly": 1200,
    "yearly": 1200,
    "notes": "per user/month — Application suite built to improve team productivity and collaboration."
  },
  {
    "tool": "Zoho Writer",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "basic features — Word processor for focused writing and discussions."
  },
  {
    "tool": "Zoho Writer",
    "domain": "Email_Storage_and_Collaboration",
    "edition": "Premium",
    "monthly": 300,
    "yearly": 300,
    "notes": "per user/month — Word processor for focused writing and discussions."
  },
  {
    "tool": "Zoho ZeptoMail",
    "domain": "Developer_Platforms",
    "edition": "Free",
    "monthly": 0,
    "yearly": 0,
    "notes": "up to 10,000 emails/month — Secure and reliable transactional email sending service."
  },
  {
    "tool": "Zoho ZeptoMail",
    "domain": "Developer_Platforms",
    "edition": "Pay-as-you-go",
    "monthly": 1,
    "yearly": 1,
    "notes": "per 1000 emails — Secure and reliable transactional email sending service."
  }
];;
